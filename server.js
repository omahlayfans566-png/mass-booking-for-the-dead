require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const store = require('./lib/store');
const paystack = require('./lib/paystack');
const { sendBookingConfirmationEmail } = require('./lib/email');

const app = express();
const PORT = process.env.PORT || 3000;

// Recipient email configuration (defaults to youngchosenforchrist@gmail.com)
const RECIPIENT_EMAIL = process.env.MASS_BOOKING_EMAIL || process.env.RECIPIENT_EMAIL || 'youngchosenforchrist@gmail.com';

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

    store.saveBooking(bookingRecord);

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
    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to initialize Paystack payment. Please try again.'
    });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/verify-payment/:reference - Verify payment on server & trigger email
// -----------------------------------------------------------------------------
app.get('/api/verify-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) {
      return res.status(400).json({ success: false, message: 'Transaction reference is required.' });
    }

    // Retrieve or instantiate booking record
    let booking = store.getBooking(reference);

    // If already verified and confirmed as paid (e.g. by webhook or previous verification)
    if (booking && booking.paymentStatus === 'paid') {
      // If email was not yet delivered (e.g. earlier network blip), retry delivery safely
      if (!booking.emailDelivered) {
        try {
          const emailResult = await sendBookingConfirmationEmail(booking);
          booking = store.updateBooking(reference, {
            emailDelivered: true,
            emailSentAt: new Date().toISOString(),
            emailProvider: emailResult.provider,
            emailError: null
          });
        } catch (emailErr) {
          console.error(`⚠️ [Verify] Email delivery pending:`, emailErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        alreadyConfirmed: true,
        message: 'Your Mass booking has been received successfully. Your payment has been confirmed, and your Mass intention has been submitted. Thank you for supporting this holy Mass. God bless you.',
        booking: sanitizeBooking(booking)
      });
    }

    // Verify transaction with Paystack API
    const tx = await paystack.verifyTransaction(reference);

    // Transaction must exist and have status 'success'
    if (!tx || tx.status !== 'success') {
      const txStatus = tx ? tx.status : 'unknown';
      if (booking) {
        store.updateBooking(reference, { paymentStatus: txStatus });
      }
      return res.status(400).json({
        success: false,
        paymentStatus: txStatus,
        message: `Payment status is '${txStatus}'. A Mass booking can only be confirmed after successful payment.`
      });
    }

    // Validate currency matches NGN
    if (String(tx.currency).toUpperCase() !== 'NGN') {
      return res.status(400).json({
        success: false,
        message: `Currency mismatch. Expected NGN but received ${tx.currency}.`
      });
    }

    // Reconstruct booking data if missing in memory (e.g. from Paystack metadata)
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
        paymentStatus: 'paid',
        paidAt: tx.paid_at || new Date().toISOString(),
        channel: tx.channel,
        emailDelivered: false,
        createdAt: tx.created_at || new Date().toISOString()
      };
      store.saveBooking(booking);
    }

    // Validate amount matches expected booking amount
    if (booking.amountInKobo && tx.amount !== booking.amountInKobo) {
      console.error(`Amount mismatch: expected ${booking.amountInKobo} kobo, got ${tx.amount} kobo`);
      return res.status(400).json({
        success: false,
        message: 'Payment amount mismatch. Please contact support.'
      });
    }

    // Mark as PAID
    const updates = {
      paymentStatus: 'paid',
      paidAt: tx.paid_at || new Date().toISOString(),
      channel: tx.channel || 'paystack'
    };
    booking = store.updateBooking(reference, updates);

    // IDEMPOTENCY: Check if confirmation email was already dispatched
    if (booking.emailDelivered) {
      console.log(`[Verify] Booking ${booking.bookingReference} was already confirmed and email sent. Idempotent return.`);
      return res.status(200).json({
        success: true,
        alreadyConfirmed: true,
        message: 'Your Mass booking has been received successfully. Your payment has been confirmed, and your Mass intention has been submitted. Thank you for supporting this holy Mass. God bless you.',
        booking: sanitizeBooking(booking)
      });
    }

    // Send confirmation email to youngchosenforchrist@gmail.com strictly after verification
    try {
      const emailResult = await sendBookingConfirmationEmail(booking);
      booking = store.updateBooking(reference, {
        emailDelivered: true,
        emailSentAt: new Date().toISOString(),
        emailProvider: emailResult.provider,
        emailError: null
      });
      console.log(`✅ [Verify] Confirmation email successfully delivered for booking ${booking.bookingReference}`);
    } catch (emailErr) {
      // Payment remains CONFIRMED, but record email delivery failure for retry
      console.error(`⚠️ [Verify] Payment confirmed, but email dispatch failed for ${booking.bookingReference}:`, emailErr.message);
      booking = store.updateBooking(reference, {
        emailDelivered: false,
        emailError: emailErr.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Your Mass booking has been received successfully. Your payment has been confirmed, and your Mass intention has been submitted. Thank you for supporting this holy Mass. God bless you.',
      booking: sanitizeBooking(booking)
    });

  } catch (error) {
    console.error('[Verify Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Payment verification failed. Please check your reference and try again.'
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

      // Find or recreate booking
      let booking = store.getBooking(reference);
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
        store.saveBooking(booking);
      } else {
        // Validate amount matches
        if (booking.amountInKobo && data.amount !== booking.amountInKobo) {
          console.error(`Webhook amount mismatch for ${reference}: expected ${booking.amountInKobo}, got ${data.amount}`);
          return res.status(200).json({ received: true, error: 'Amount mismatch' });
        }

        booking = store.updateBooking(reference, {
          paymentStatus: 'paid',
          paidAt: data.paid_at || new Date().toISOString(),
          channel: data.channel
        });
      }

      // IDEMPOTENCY: Check if confirmation email was already dispatched
      if (booking.emailDelivered) {
        console.log(`[Webhook] Booking ${booking.bookingReference} already confirmed and email dispatched. Skipping duplicate email.`);
        return res.status(200).json({ received: true, message: 'Already processed' });
      }

      // Send email strictly after payment verification
      try {
        const emailResult = await sendBookingConfirmationEmail(booking);
        store.updateBooking(reference, {
          emailDelivered: true,
          emailSentAt: new Date().toISOString(),
          emailProvider: emailResult.provider,
          emailError: null
        });
        console.log(`✅ [Webhook] Confirmation email successfully delivered to ${RECIPIENT_EMAIL} [${booking.bookingReference}]`);
      } catch (emailErr) {
        console.error(`⚠️ [Webhook] Email dispatch failed for ${booking.bookingReference}:`, emailErr.message);
        store.updateBooking(reference, {
          emailDelivered: false,
          emailError: emailErr.message
        });
      }
    }

    // Always acknowledge 200 OK to Paystack
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook Processing Error]:', error.message);
    return res.status(500).json({ received: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 5. POST /api/admin/retry-email/:reference - Safe email re-delivery for paid booking
// -----------------------------------------------------------------------------
app.post('/api/admin/retry-email/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const booking = store.getBooking(reference);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking reference not found.' });
    }

    if (booking.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot send confirmation email for an unpaid booking.'
      });
    }

    const emailResult = await sendBookingConfirmationEmail(booking);
    const updated = store.updateBooking(reference, {
      emailDelivered: true,
      emailSentAt: new Date().toISOString(),
      emailProvider: emailResult.provider,
      emailError: null
    });

    return res.status(200).json({
      success: true,
      message: `Confirmation email re-dispatched successfully to ${RECIPIENT_EMAIL} via ${emailResult.provider}.`,
      booking: sanitizeBooking(updated)
    });

  } catch (error) {
    console.error('[Admin Retry Email Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to re-dispatch email.'
    });
  }
});

// -----------------------------------------------------------------------------
// 6. GET /api/health - Diagnostic endpoint
// -----------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
  const isLive = secretKey.startsWith('sk_live_');
  const isTest = secretKey.startsWith('sk_test_');

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    recipientEmail: RECIPIENT_EMAIL,
    paystackConfigured: !!secretKey,
    paystackEnvironment: isLive ? 'LIVE' : (isTest ? 'TEST' : 'UNCONFIGURED'),
    resendConfigured: !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== ''),
    smtpConfigured: !!(process.env.GMAIL_USER || process.env.SMTP_HOST),
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

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`✝ YCCCI Mass Booking & Paystack Live Payment Server Running`);
  console.log(`  Local URL:        http://localhost:${PORT}`);
  console.log(`  Recipient Email:  ${RECIPIENT_EMAIL}`);
  console.log(`  Paystack Mode:    ${(process.env.PAYSTACK_SECRET_KEY || '').startsWith('sk_live_') ? 'LIVE 🟢' : 'NOT CONFIGURED ⚠️'}`);
  console.log(`  Email Dispatch:   ${process.env.RESEND_API_KEY ? 'Resend API Configured' : (process.env.GMAIL_USER ? 'SMTP Configured' : 'Awaiting credentials')}`);
  console.log(`======================================================\n`);
});
