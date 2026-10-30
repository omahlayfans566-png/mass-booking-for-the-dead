require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const store = require('./lib/store');
const paystack = require('./lib/paystack');
const { sendBookingConfirmationEmail } = require('./lib/email');

// =============================================================================
// DATA PERSISTENCE — MongoDB Atlas
// =============================================================================
// Bookings are stored in MongoDB Atlas via lib/store.js.
// Booking data persists across Render restarts and redeployments.
//
// Required environment variable (set in Render → Environment):
//   MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/yccci_bookings
//
// If MONGODB_URI is not set, all booking operations will fail with a clear
// error message — no silent data loss.
// =============================================================================

const app = express();
const PORT = process.env.PORT || 3000;

// Recipient email configuration — fixed destination for all booking confirmations
const RECIPIENT_EMAIL = process.env.ADMIN_EMAIL || process.env.MASS_BOOKING_EMAIL || process.env.RECIPIENT_EMAIL || 'younganchoseforchrist@gmail.com';

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'x-paystack-signature']
}));

// Capture raw body for Paystack HMAC SHA512 webhook signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Rate limiter: max 30 payment initializations per 15 mins per IP
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Too many requests from this connection. Please wait a few minutes and try again.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Helper: Sanitize booking object before returning to client (prevents exposing internal server fields)
function sanitizeBooking(booking) {
  if (!booking) return null;
  return {
    bookingReference: booking.bookingReference,
    paystackReference: booking.paystackReference,
    deceasedNames: booking.deceasedNames,
    totalSouls: (booking.deceasedNames || []).length,
    offeringAmount: booking.offeringAmount,
    currency: booking.currency || 'NGN',
    requesterName: booking.requesterName,
    requesterEmail: booking.requesterEmail,
    intentionNotes: booking.intentionNotes || '',
    paymentStatus: booking.paymentStatus,
    paidAt: booking.paidAt || null,
    channel: booking.channel || null,
    emailDelivered: !!booking.emailDelivered
  };
}

// -----------------------------------------------------------------------------
// 1. GET /api/config - Safe public configuration for frontend
// -----------------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    currency: 'NGN',
    recipientEmail: RECIPIENT_EMAIL,
    environment: (process.env.PAYSTACK_SECRET_KEY || '').startsWith('sk_live_') ? 'live' : 'test'
  });
});

// -----------------------------------------------------------------------------
// 2. POST /api/initialize-payment - Securely initialize Paystack transaction
// -----------------------------------------------------------------------------
app.post('/api/initialize-payment', paymentLimiter, async (req, res) => {
  try {
    const {
      deceasedNames: rawDeceased,
      offeringAmount: rawAmount,
      requesterEmail,
      requesterName,
      intentionNotes
    } = req.body;

    // 1. Validate deceased names
    let deceasedNames = [];
    if (Array.isArray(rawDeceased)) {
      deceasedNames = rawDeceased;
    } else if (typeof rawDeceased === 'string') {
      deceasedNames = rawDeceased.split(',').map(s => s.trim());
    }

    deceasedNames = deceasedNames
      .map(name => (typeof name === 'string' ? name.trim() : ''))
      .filter(name => name.length > 0);

    if (deceasedNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one valid name of a deceased loved one.'
      });
    }

    // 2. Validate requester email (mandatory for Paystack transaction)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!requesterEmail || !emailRegex.test(String(requesterEmail).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address to receive your payment receipt and booking confirmation.'
      });
    }
    const cleanEmail = String(requesterEmail).trim().toLowerCase();

    // 3. Validate and sanitize offering amount
    const sanitizedAmountStr = String(rawAmount || '').replace(/[₦,\s]/g, '');
    const isNumericAmount = /^[0-9]+(\.[0-9]{1,2})?$/.test(sanitizedAmountStr);
    const numericAmount = parseFloat(sanitizedAmountStr);

    if (!rawAmount || sanitizedAmountStr === '') {
      return res.status(400).json({
        success: false,
        message: 'Please enter your Mass offering amount.'
      });
    }

    if (!isNumericAmount || isNaN(numericAmount)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid numeric offering amount.'
      });
    }

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Mass offering amount must be greater than zero.'
      });
    }

    if (numericAmount < 100) {
      return res.status(400).json({
        success: false,
        message: 'The minimum Mass offering amount is ₦100.'
      });
    }

    // Convert to kobo (minor currency unit: 1 NGN = 100 kobo)
    const amountInKobo = Math.round(numericAmount * 100);

    // 4. Generate unique Memorial Booking Reference & Paystack Reference
    const currentYear = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const bookingReference = `YCCCI-NOV-${currentYear}-${randomSuffix}`;
    const paystackReference = `YCCCI-PAY-${Date.now()}-${randomSuffix}`;

    // Determine callback URL
    const baseUrl = process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim() !== ''
      ? process.env.FRONTEND_URL.trim().replace(/\/+$/, '')
      : (req.headers.origin || `${req.protocol}://${req.get('host')}`);
    const callbackUrl = `${baseUrl}/?reference=${encodeURIComponent(paystackReference)}`;

    // Build custom metadata for Paystack
    const metadata = {
      booking_reference: bookingReference,
      deceased_names: deceasedNames,
      requester_email: cleanEmail,
      requester_name: (requesterName || '').trim() || 'Parishioner',
      intention_notes: (intentionNotes || '').trim(),
      offering_amount: numericAmount,
      currency: 'NGN',
      custom_fields: [
        {
          display_name: 'Memorial Reference',
          variable_name: 'booking_reference',
          value: bookingReference
        },
        {
          display_name: 'Deceased Souls',
          variable_name: 'deceased_souls',
          value: deceasedNames.slice(0, 5).join(', ') + (deceasedNames.length > 5 ? ` (+${deceasedNames.length - 5} more)` : '')
        },
        {
          display_name: 'Offering Amount',
          variable_name: 'offering_amount',
          value: `₦${numericAmount.toLocaleString('en-NG')}`
        }
      ]
    };

    // 5. Initialize transaction with Paystack official API
    const paystackResult = await paystack.initializeTransaction({
      email: cleanEmail,
      amountInKobo,
      reference: paystackReference,
      callbackUrl,
      metadata
    });

    // 6. Record pending booking in persistent store
    const bookingRecord = {
      bookingReference,
      paystackReference,
      deceasedNames,
      offeringAmount: numericAmount,
      amountInKobo,
      currency: 'NGN',
      requesterEmail: cleanEmail,
      requesterName: (requesterName || '').trim() || 'Parishioner',
      intentionNotes: (intentionNotes || '').trim(),
      paymentStatus: 'pending',
      emailDelivered: false,
      createdAt: new Date().toISOString()
    };

    await store.saveBooking(bookingRecord);

    console.log(`[Paystack Init] Created pending booking ${bookingReference} (${paystackReference}) for ${cleanEmail} - ₦${numericAmount.toLocaleString()}`);

    return res.status(200).json({
      success: true,
      authorization_url: paystackResult.authorization_url,
      access_code: paystackResult.access_code,
      reference: paystackReference,
      bookingReference
    });

  } catch (error) {
    console.error('[Paystack Init Error]:', error.message);
    // Return a safe, generic message — never expose internal config errors to the browser
    const isConfigError = error.message && (
      error.message.includes('MONGODB_URI') ||
      error.message.includes('MongoDB') ||
      error.message.includes('PAYSTACK_SECRET_KEY') ||
      error.message.includes('not configured')
    );
    return res.status(500).json({
      success: false,
      message: isConfigError
        ? 'We\'re temporarily unable to process your booking. Please try again shortly or contact the church administration for assistance.'
        : (error.message || 'Unable to initialize Paystack payment. Please try again.')
    });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/verify-payment/:reference
//    Verifies payment with Paystack and marks the booking as paid.
//    Does NOT send any email — email is only sent when the customer
//    explicitly clicks SEND MESSAGE (see /api/send-message below).
// -----------------------------------------------------------------------------
app.get('/api/verify-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) {
      return res.status(400).json({ success: false, message: 'Transaction reference is required.' });
    }

    // Retrieve existing booking record
    let booking = await store.getBooking(reference);

    // Already verified as paid — return current state so frontend can show SEND MESSAGE
    if (booking && booking.paymentStatus === 'paid') {
      console.log(`[Verify] Booking ${booking.bookingReference} already verified as paid.`);
      return res.status(200).json({
        success: true,
        paymentVerified: true,
        alreadyConfirmed: !!booking.emailDelivered,
        message: 'Payment confirmed. You may now submit your Mass intention.',
        booking: sanitizeBooking(booking)
      });
    }

    // Verify transaction directly with Paystack API (server-side only)
    const tx = await paystack.verifyTransaction(reference);

    // Payment must be successful
    if (!tx || tx.status !== 'success') {
      const txStatus = tx ? tx.status : 'unknown';
      if (booking) await store.updateBooking(reference, { paymentStatus: txStatus });
      return res.status(400).json({
        success: false,
        paymentVerified: false,
        paymentStatus: txStatus,
        message: `Payment status is '${txStatus}'. Only a successful payment can proceed to message submission.`
      });
    }

    // Validate currency
    if (String(tx.currency).toUpperCase() !== 'NGN') {
      return res.status(400).json({
        success: false,
        message: `Currency mismatch. Expected NGN but received ${tx.currency}.`
      });
    }

    // Reconstruct booking from Paystack metadata if it was lost (e.g. server restart)
    if (!booking) {
      const meta = tx.metadata || {};
      booking = {
        bookingReference: meta.booking_reference || `YCCCI-NOV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        paystackReference: reference,
        deceasedNames: meta.deceased_names || ['Departed Soul'],
        offeringAmount: meta.offering_amount || (tx.amount / 100),
        amountInKobo: tx.amount,
        currency: tx.currency,
        requesterEmail: (tx.customer && tx.customer.email) || meta.requester_email || '',
        requesterName: meta.requester_name || 'Parishioner',
        intentionNotes: meta.intention_notes || '',
        paymentStatus: 'pending',
        emailDelivered: false,
        createdAt: tx.created_at || new Date().toISOString()
      };
      await store.saveBooking(booking);
    }

    // Validate that the paid amount matches what was originally booked
    if (booking.amountInKobo && tx.amount !== booking.amountInKobo) {
      console.error(`[Verify] Amount mismatch: expected ${booking.amountInKobo} kobo, got ${tx.amount} kobo`);
      return res.status(400).json({
        success: false,
        message: 'Payment amount mismatch. Please contact support.'
      });
    }

    // Mark booking as PAID — email is NOT sent here
    booking = await store.updateBooking(reference, {
      paymentStatus: 'paid',
      paidAt: tx.paid_at || new Date().toISOString(),
      channel: tx.channel || 'paystack'
    });

    console.log(`✅ [Verify] Payment verified for ${booking.bookingReference}. Awaiting customer SEND MESSAGE action.`);

    // Return verified state — frontend will now show the SEND MESSAGE button
    return res.status(200).json({
      success: true,
      paymentVerified: true,
      alreadyConfirmed: false,
      message: 'Payment confirmed. You may now submit your Mass intention.',
      booking: sanitizeBooking(booking)
    });

  } catch (error) {
    console.error('[Verify Error]:', error.message);
    const isConfigError = error.message && (error.message.includes('MONGODB_URI') || error.message.includes('MongoDB') || error.message.includes('not configured'));
    return res.status(500).json({
      success: false,
      message: isConfigError
        ? 'We\'re temporarily unable to verify your payment. Please try again or contact the church administration with your payment reference.'
        : (error.message || 'Payment verification failed. Please check your reference and try again.')
    });
  }
});

// -----------------------------------------------------------------------------
// 3b. POST /api/send-message
//     Called only when the customer explicitly clicks SEND MESSAGE.
//     Requires prior successful payment verification.
//     Sends the Mass intention email via Brevo SMTP to younganchoseforchrist@gmail.com.
//     Idempotent: will not send a duplicate if email was already delivered.
// -----------------------------------------------------------------------------
app.post('/api/send-message', async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference || typeof reference !== 'string' || reference.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'A valid payment reference is required to send your Mass intention.'
      });
    }

    const ref = reference.trim();
    const booking = await store.getBooking(ref);

    // Booking must exist
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found. Please complete payment before submitting your intention.'
      });
    }

    // Payment must be verified as paid — cannot bypass by sending reference directly
    if (booking.paymentStatus !== 'paid') {
      return res.status(403).json({
        success: false,
        message: 'Your payment has not been verified. Please complete payment before sending your intention.'
      });
    }

    // IDEMPOTENCY: prevent duplicate emails
    if (booking.emailDelivered) {
      console.log(`[SendMessage] Booking ${booking.bookingReference} email already delivered. Returning idempotent success.`);
      return res.status(200).json({
        success: true,
        alreadySent: true,
        message: 'Your Mass intention has already been submitted successfully.'
      });
    }

    // Send email via Brevo SMTP — recipient is always the fixed church address from env
    const emailResult = await sendBookingConfirmationEmail(booking);

    await store.updateBooking(ref, {
      emailDelivered: true,
      emailSentAt: new Date().toISOString(),
      emailProvider: emailResult.provider,
      emailError: null
    });

    console.log(`✅ [SendMessage] Intention email delivered via ${emailResult.provider} for ${booking.bookingReference}`);

    return res.status(200).json({
      success: true,
      message: 'Your Mass intention has been submitted successfully. God bless you.',
      provider: emailResult.provider,
      messageId: emailResult.messageId || null
    });

  } catch (error) {
    console.error('[SendMessage Error]:', error.message);

    // Record failed attempt without marking as delivered
    if (req.body && req.body.reference) {
      await store.updateBooking(req.body.reference.trim(), {
        emailDelivered: false,
        emailError: error.message
      });
    }

    const isConfigError = error.message && (error.message.includes('MONGODB_URI') || error.message.includes('MongoDB') || error.message.includes('not configured'));
    return res.status(500).json({
      success: false,
      message: isConfigError
        ? 'We\'re temporarily unable to submit your intention. Please try again shortly or contact the church administration for assistance.'
        : 'Unable to submit your Mass intention at this time. Please try again.'
    });
  }
});

// -----------------------------------------------------------------------------
// 4. POST /api/webhook/paystack - Official Paystack Webhook Handler (HMAC SHA512)
// -----------------------------------------------------------------------------
app.post('/api/webhook/paystack', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
      console.warn('⚠️ Webhook received without x-paystack-signature header.');
      return res.status(401).json({ received: false, message: 'Missing signature' });
    }

    // Verify HMAC SHA512 signature using PAYSTACK_SECRET_KEY
    const isValid = paystack.verifyWebhookSignature(req.rawBody, signature);
    if (!isValid) {
      console.warn('❌ Webhook received with invalid signature.');
      return res.status(401).json({ received: false, message: 'Invalid signature' });
    }

    const event = req.body;
    console.log(`[Webhook Event Received]: ${event.event}`);

    // Process 'charge.success'
    if (event.event === 'charge.success') {
      const data = event.data;
      const reference = data.reference;

      if (!reference) {
        return res.status(200).json({ received: true });
      }

      // Check status & currency
      if (data.status !== 'success' || String(data.currency).toUpperCase() !== 'NGN') {
        console.warn(`Webhook charge.success skipped: status=${data.status}, currency=${data.currency}`);
        return res.status(200).json({ received: true });
      }

      // Find or recreate booking record
      let booking = await store.getBooking(reference);
      if (!booking) {
        const meta = data.metadata || {};
        booking = {
          bookingReference: meta.booking_reference || `YCCCI-NOV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          paystackReference: reference,
          deceasedNames: meta.deceased_names || ['Departed Soul'],
          offeringAmount: meta.offering_amount || (data.amount / 100),
          amountInKobo: data.amount,
          currency: data.currency,
          requesterEmail: (data.customer && data.customer.email) || meta.requester_email || '',
          requesterName: meta.requester_name || 'Parishioner',
          intentionNotes: meta.intention_notes || '',
          paymentStatus: 'paid',
          paidAt: data.paid_at || new Date().toISOString(),
          channel: data.channel,
          emailDelivered: false,
          createdAt: data.created_at || new Date().toISOString()
        };
        await store.saveBooking(booking);
        console.log(`[Webhook] Reconstructed booking ${booking.bookingReference} from metadata. Awaiting customer SEND MESSAGE.`);
      } else {
        // Validate amount matches
        if (booking.amountInKobo && data.amount !== booking.amountInKobo) {
          console.error(`Webhook amount mismatch for ${reference}: expected ${booking.amountInKobo}, got ${data.amount}`);
          return res.status(200).json({ received: true, error: 'Amount mismatch' });
        }

        booking = await store.updateBooking(reference, {
          paymentStatus: 'paid',
          paidAt: data.paid_at || new Date().toISOString(),
          channel: data.channel
        });
      }

      // IDEMPOTENCY: booking already paid — nothing more to do here
      if (booking.emailDelivered) {
        console.log(`[Webhook] Booking ${booking.bookingReference} already processed. Skipping.`);
        return res.status(200).json({ received: true, message: 'Already processed' });
      }

      // Mark as paid — email will be sent only when customer clicks SEND MESSAGE
      if (booking.paymentStatus !== 'paid') {
        await store.updateBooking(reference, {
          paymentStatus: 'paid',
          paidAt: data.paid_at || new Date().toISOString(),
          channel: data.channel
        });
        console.log(`✅ [Webhook] Booking ${booking.bookingReference} marked as paid. Awaiting customer SEND MESSAGE.`);
      }
    }

    // Always acknowledge 200 OK to Paystack
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook Processing Error]:', error.message);
    return res.status(500).json({ received: false, error: error.message });
  }
});

// NOTE: /api/admin/retry-email was removed.
// Retries are handled safely and idempotently by POST /api/send-message,
// which already checks paymentStatus === 'paid' and prevents duplicate sends.

// -----------------------------------------------------------------------------
// 6. GET /api/health - Diagnostic endpoint
// -----------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
  const isLive = secretKey.startsWith('sk_live_');
  const isTest = secretKey.startsWith('sk_test_');

  // Determine which email provider is active
  const resendConfigured = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== '');
  const brevoUser = process.env.BREVO_SMTP_USER || '';
  const brevoConfigured = !!(
    process.env.BREVO_SMTP_PASS &&
    brevoUser &&
    brevoUser !== 'replace_with_your_brevo_login_email'
  );
  const gmailConfigured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  const smtpConfigured  = !!(process.env.SMTP_HOST);
  const mongoConfigured = !!(process.env.MONGODB_URI && process.env.MONGODB_URI.trim() !== '');

  let activeEmailProvider = 'UNCONFIGURED';
  if (resendConfigured) activeEmailProvider = 'Resend';
  else if (brevoConfigured) activeEmailProvider = 'Brevo SMTP';
  else if (gmailConfigured) activeEmailProvider = 'Gmail SMTP';
  else if (smtpConfigured)  activeEmailProvider = 'Generic SMTP';

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    recipientEmail: RECIPIENT_EMAIL,
    paystackConfigured: !!secretKey,
    paystackEnvironment: isLive ? 'LIVE' : (isTest ? 'TEST' : 'UNCONFIGURED'),
    emailProvider: activeEmailProvider,
    emailReady: activeEmailProvider !== 'UNCONFIGURED',
    resendConfigured,
    brevoConfigured,
    gmailConfigured,
    mongoConfigured,
    currency: 'NGN'
  });
});

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Global error handling middleware
app.use((err, req, res, next) => {
  if (err) {
    console.error('Handled Error:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message || 'An error occurred during request processing.'
    });
  }
  next();
});

// Fallback to index.html for client-side navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, async () => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
  const brevoUser = process.env.BREVO_SMTP_USER || '';
  const brevoReady = !!(
    process.env.BREVO_SMTP_PASS &&
    brevoUser &&
    brevoUser !== 'replace_with_your_brevo_login_email'
  );
  const resendReady  = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
  const mongoReady   = !!(process.env.MONGODB_URI && process.env.MONGODB_URI.trim());
  const emailStatus  = resendReady ? 'Resend API ✅' : brevoReady ? 'Brevo SMTP ✅' : (process.env.GMAIL_USER ? 'Gmail SMTP ✅' : '⚠️  Not configured');
  const mongoStatus  = mongoReady  ? 'MongoDB Atlas ✅' : '⚠️  MONGODB_URI not set — bookings will fail';

  console.log(`\n======================================================`);
  console.log(`✝ YCCCI Mass Booking & Paystack Live Payment Server`);
  console.log(`  Local URL:        http://localhost:${PORT}`);
  console.log(`  Recipient Email:  ${RECIPIENT_EMAIL}`);
  console.log(`  Paystack Mode:    ${secretKey.startsWith('sk_live_') ? 'LIVE 🟢' : secretKey.startsWith('sk_test_') ? 'TEST 🟡' : 'NOT CONFIGURED ⚠️'}`);
  console.log(`  Email Provider:   ${emailStatus}`);
  console.log(`  Database:         ${mongoStatus}`);
  console.log(`======================================================\n`);

  // Probe MongoDB connection at startup so misconfiguration is caught immediately
  // rather than silently failing during a customer's checkout.
  if (mongoReady) {
    try {
      await store.getBooking('__startup_probe__');
      console.log('✅ [Startup] MongoDB Atlas connection verified.');
    } catch (err) {
      console.error(`❌ [Startup] MongoDB connection FAILED: ${err.message}`);
      console.error('   Set MONGODB_URI in Render Environment Variables and redeploy.');
    }
  } else {
    console.error('❌ [Startup] MONGODB_URI is not set. All booking operations will fail.');
    console.error('   Add MONGODB_URI to Render Environment Variables and redeploy.');
  }
});
