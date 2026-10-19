require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for cross-origin requests (e.g., from Render Static Site to Render Web Service)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter: max 15 intention submissions per 15 minutes per IP to prevent spam
const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    message: 'Too many intention requests from this connection. Please wait a few minutes and try again.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Configure Multer for IN-MEMORY storage only (NO disk/database saving as strictly required)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB maximum
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    const allowedExts = ['.png', '.jpg', '.jpeg', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and PDF files are accepted.'));
    }
  }
});

// Helper: Build Dignified Catholic HTML Email
function buildMassIntentionHtml({ bookingReference, deceasedNames, totalSouls, offeringAmount, submissionDate, fileName, fileSizeFormatted }) {
  const deceasedListHtml = deceasedNames
    .map(name => `<li style="padding: 4px 0; font-size: 15px; color: #1B1B20;">✝ <strong>${name}</strong></li>`)
    .join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>New Mass Intention Booking — YCCCI</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FBF8FF; margin: 0; padding: 24px; color: #1B1B20;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 12px; border: 1px solid #DFD7C7; overflow: hidden; box-shadow: 0 4px 12px rgba(77, 0, 17, 0.05);">
            <!-- Header Band -->
            <tr>
              <td style="background-color: #4D0011; padding: 24px 32px; text-align: center;">
                <h1 style="color: #FFFFFF; margin: 0 0 6px 0; font-size: 22px; font-weight: 600; letter-spacing: 0.02em;">
                  Young and Chosen for Christ
                </h1>
                <p style="color: #FFDADA; margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em;">
                  November Mass Intentions for the Faithful Departed
                </p>
              </td>
            </tr>

            <!-- Content Area -->
            <tr>
              <td style="padding: 32px;">
                <div style="background-color: #FDFBF7; border-left: 4px solid #775A19; padding: 12px 16px; margin-bottom: 24px;">
                  <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #775A19; font-weight: bold; display: block;">
                    Memorial Submission Reference
                  </span>
                  <strong style="font-size: 18px; color: #4D0011; font-family: monospace;">
                    ${bookingReference}
                  </strong>
                </div>

                <h2 style="font-size: 17px; color: #4D0011; margin: 0 0 12px 0; border-bottom: 1px solid #DFD7C7; padding-bottom: 8px;">
                  Names of the Faithful Departed (${totalSouls})
                </h2>
                <ul style="list-style: none; padding-left: 0; margin: 0 0 24px 0;">
                  ${deceasedListHtml}
                </ul>

                <h2 style="font-size: 17px; color: #4D0011; margin: 0 0 12px 0; border-bottom: 1px solid #DFD7C7; padding-bottom: 8px;">
                  Stipend & Offering Details
                </h2>
                <table width="100%" style="font-size: 14px; margin-bottom: 24px;">
                  <tr>
                    <td style="padding: 6px 0; color: #554243; width: 45%;">Offering Amount:</td>
                    <td style="padding: 6px 0; font-weight: bold; color: #1B1B20; font-size: 16px;">${offeringAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #554243;">Bank Deposited To:</td>
                    <td style="padding: 6px 0; color: #1B1B20;">Zenith Bank — 1228821057</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #554243;">Account Name:</td>
                    <td style="padding: 6px 0; color: #1B1B20;">Young and Chosen for Christ</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #554243;">Submission Date & Time:</td>
                    <td style="padding: 6px 0; color: #1B1B20;">${submissionDate}</td>
                  </tr>
                </table>

                <div style="background-color: #F5F2F9; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
                  <strong style="font-size: 13px; color: #4D0011; display: block; margin-bottom: 4px;">
                    📎 Proof of Payment Attached
                  </strong>
                  <span style="font-size: 13px; color: #554243;">
                    Filename: <strong>${fileName}</strong> (${fileSizeFormatted})
                  </span>
                  <p style="margin: 6px 0 0 0; font-size: 12px; color: #887272;">
                    The original transfer receipt uploaded by the requester is attached directly to this email.
                  </p>
                </div>

                <p style="font-size: 12px; color: #887272; line-height: 1.5; margin: 0; text-align: center; border-top: 1px solid #DFD7C7; padding-top: 16px;">
                  Requiem aeternam dona eis, Domine, et lux perpetua luceat eis.<br>
                  <em>Submitted via the official YCCCI Mass Booking Memorial Portal.</em>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

// -----------------------------------------------------------------------------
// POST /api/submit-intention (Zero database saving: processes strictly in-memory)
// -----------------------------------------------------------------------------
app.post('/api/submit-intention', submissionLimiter, upload.single('attachment'), async (req, res) => {
  try {
    // 1. Spam check (honeypot)
    if (req.body.website_trap || req.body._honeypot) {
      console.warn('Spam trap triggered.');
      return res.status(400).json({ success: false, message: 'Invalid submission.' });
    }

    // 2. Validate deceased names
    let deceasedNames = [];
    if (req.body['deceasedName[]']) {
      const raw = req.body['deceasedName[]'];
      deceasedNames = Array.isArray(raw) ? raw : [raw];
    } else if (req.body.Deceased_Souls) {
      deceasedNames = req.body.Deceased_Souls.split(',').map(s => s.trim());
    }

    deceasedNames = deceasedNames
      .map(name => typeof name === 'string' ? name.trim() : '')
      .filter(name => name.length > 0);

    if (deceasedNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one valid name of a deceased loved one.'
      });
    }

    // 3. Validate offering amount
    const rawOffering = req.body.offeringAmount || req.body.Offering_Amount_NGN || '';
    const sanitizedOffering = String(rawOffering).replace(/[₦,\s]/g, '');
    const numericOffering = parseFloat(sanitizedOffering);

    if (isNaN(numericOffering) || numericOffering <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid Mass offering amount.'
      });
    }

    const formattedOffering = '₦' + numericOffering.toLocaleString();

    // 4. Validate payment proof file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload proof of payment (bank transfer receipt or screenshot).'
      });
    }

    // 5. Generate / parse booking reference and timestamp
    const currentYear = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const bookingReference = req.body.Booking_Reference || `YCCCI-NOV-${currentYear}-${randomSuffix}`;
    const submissionDate = new Date().toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'medium'
    });

    const fileSizeKB = (req.file.size / 1024).toFixed(0);
    const fileSizeFormatted = fileSizeKB > 1024 ? (req.file.size / (1024 * 1024)).toFixed(1) + ' MB' : fileSizeKB + ' KB';

    // 6. Recipient: strictly youngchosenforchrist@gmail.com
    const recipientEmail = process.env.RECIPIENT_EMAIL || 'youngchosenforchrist@gmail.com';
    const emailSubject = `New Mass Intention Booking — YCCCI [${bookingReference}]`;

    const htmlContent = buildMassIntentionHtml({
      bookingReference,
      deceasedNames,
      totalSouls: deceasedNames.length,
      offeringAmount: formattedOffering,
      submissionDate,
      fileName: req.file.originalname,
      fileSizeFormatted
    });

    const textContent = `New Mass Intention Booking — YCCCI\n\nReference: ${bookingReference}\nDeceased Souls:\n${deceasedNames.map(n => `- ${n}`).join('\n')}\nOffering Amount: ${formattedOffering}\nBank: Zenith Bank (1228821057)\nDate: ${submissionDate}\nReceipt attached: ${req.file.originalname} (${fileSizeFormatted})`;

    // 7. Dispatch Email via Resend (or SMTP fallback if configured)
    let emailSent = false;
    let providerName = '';

    // Primary: Resend API
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== '') {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromAddress = process.env.SENDER_EMAIL || 'YCCCI Mass Booking <onboarding@resend.dev>';

        const resendResult = await resend.emails.send({
          from: fromAddress,
          to: recipientEmail,
          subject: emailSubject,
          html: htmlContent,
          text: textContent,
          attachments: [
            {
              filename: req.file.originalname,
              content: req.file.buffer
            }
          ]
        });

        if (resendResult.error) {
          throw new Error(resendResult.error.message || 'Resend API returned an error');
        }

        emailSent = true;
        providerName = 'Resend';
        console.log(`✅ Mass Intention email successfully dispatched via Resend to ${recipientEmail} [${bookingReference}]`);
      } catch (resendErr) {
        console.error('❌ Resend API dispatch failed:', resendErr.message);
        throw resendErr;
      }
    }
    // Alternative: SMTP / Gmail App Password
    else if (process.env.GMAIL_USER || process.env.SMTP_HOST) {
      try {
        const transporter = nodemailer.createTransport(
          process.env.GMAIL_USER
            ? {
                service: 'gmail',
                auth: {
                  user: process.env.GMAIL_USER,
                  pass: process.env.GMAIL_APP_PASSWORD
                }
              }
            : {
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS
                }
              }
        );

        await transporter.sendMail({
          from: process.env.SENDER_EMAIL || process.env.GMAIL_USER || 'intentions@youngandchosenforchrist.com',
          to: recipientEmail,
          subject: emailSubject,
          html: htmlContent,
          text: textContent,
          attachments: [
            {
              filename: req.file.originalname,
              content: req.file.buffer,
              contentType: req.file.mimetype
            }
          ]
        });

        emailSent = true;
        providerName = 'SMTP';
        console.log(`✅ Mass Intention email successfully dispatched via SMTP to ${recipientEmail} [${bookingReference}]`);
      } catch (smtpErr) {
        console.error('❌ SMTP dispatch failed:', smtpErr.message);
        throw smtpErr;
      }
    } else {
      console.warn('⚠️ No email provider configured! Set RESEND_API_KEY in Render environment variables.');
      return res.status(503).json({
        success: false,
        message: 'The email service is awaiting administrator configuration. Please configure RESEND_API_KEY in Render environment variables.'
      });
    }

    // Success response: confirmed only after provider accepted message
    return res.status(200).json({
      success: true,
      message: 'Your Mass intention request has been submitted successfully.',
      reference: bookingReference,
      provider: providerName
    });

  } catch (error) {
    console.error('Submission error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while sending your Mass intention email. Please try again.'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    recipient: process.env.RECIPIENT_EMAIL || 'youngchosenforchrist@gmail.com',
    resendConfigured: !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== '')
  });
});

// Serve static frontend files from project root
app.use(express.static(path.join(__dirname)));

// Global error handling middleware for Multer and validation errors
app.use((err, req, res, next) => {
  if (err) {
    console.error('Handled Error:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message || 'An error occurred during file upload or form processing.'
    });
  }
  next();
});

// Fallback to index.html for root GET route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`✝ YCCCI Mass Booking Email Dispatcher Running`);
  console.log(`  Local URL:        http://localhost:${PORT}`);
  console.log(`  Recipient Email:  ${process.env.RECIPIENT_EMAIL || 'youngchosenforchrist@gmail.com'}`);
  console.log(`  Resend Config:    ${process.env.RESEND_API_KEY ? 'Configured' : 'Missing (Set RESEND_API_KEY in Render)'}`);
  console.log(`======================================================\n`);
});
