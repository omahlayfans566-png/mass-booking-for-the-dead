const { Resend } = require('resend');
const nodemailer = require('nodemailer');

/**
 * Creates a Brevo SMTP transporter using credentials from environment variables.
 * BREVO_SMTP_HOST, BREVO_SMTP_PORT, BREVO_SMTP_USER, BREVO_SMTP_PASS
 */
function createBrevoTransporter() {
  return nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.BREVO_SMTP_PORT || '587', 10),
    secure: false, // STARTTLS on port 587
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASS
    },
    tls: {
      rejectUnauthorized: true
    }
  });
}

/**
 * Builds the official Catholic Mass Intention Confirmation HTML Email
 */
function buildMassIntentionHtml(booking) {
  const {
    bookingReference,
    paystackReference,
    deceasedNames = [],
    offeringAmount,
    currency = 'NGN',
    requesterName,
    requesterEmail,
    intentionNotes,
    paidAt,
    channel
  } = booking;

  const deceasedListHtml = deceasedNames
    .map(name => `
      <li style="padding: 8px 12px; margin-bottom: 6px; background-color: #FDFBF7; border-left: 3px solid #775A19; border-radius: 4px; font-size: 15px; color: #1B1B20; list-style: none;">
        <span style="color: #775A19; font-size: 16px; margin-right: 8px;">✝</span>
        <strong>${name}</strong>
      </li>
    `)
    .join('');

  const formattedAmount = (typeof offeringAmount === 'number')
    ? '₦' + offeringAmount.toLocaleString('en-NG')
    : String(offeringAmount || '₦0');

  const formattedDate = paidAt
    ? new Date(paidAt).toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'medium',
        timeZone: 'Africa/Lagos'
      }) + ' (WAT)'
    : new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' });

  const notesSection = intentionNotes && intentionNotes.trim().length > 0 ? `
    <div style="background-color: #FDFBF7; border-left: 4px solid #4D0011; padding: 14px 18px; margin-bottom: 24px; border-radius: 4px;">
      <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #4D0011; font-weight: bold; display: block; margin-bottom: 4px;">
        Special Mass Intention / Petition Note
      </span>
      <p style="margin: 0; font-size: 14px; color: #1B1B20; font-style: italic; line-height: 1.5;">
        “${intentionNotes.trim()}”
      </p>
    </div>
  ` : '';

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>PAID MASS BOOKING CONFIRMATION – YCCCI</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FBF8FF; margin: 0; padding: 24px; color: #1B1B20;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; border-radius: 12px; border: 1px solid #DFD7C7; overflow: hidden; box-shadow: 0 4px 16px rgba(77, 0, 17, 0.06);">
            
            <!-- Header Band: Liturgical Wine with Gold Cross -->
            <tr>
              <td style="background-color: #4D0011; padding: 28px 32px; text-align: center;">
                <div style="font-size: 24px; color: #E9C176; margin-bottom: 6px;">✝</div>
                <h1 style="color: #FFFFFF; margin: 0 0 6px 0; font-size: 22px; font-weight: 700; letter-spacing: 0.02em;">
                  Young and Chosen for Christ
                </h1>
                <p style="color: #FFDADA; margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em;">
                  November Mass Intentions for the Faithful Departed
                </p>
              </td>
            </tr>

            <!-- Verified Payment Status Pill Banner -->
            <tr>
              <td style="background-color: #E8F5E9; border-bottom: 1px solid #C8E6C9; padding: 12px 24px; text-align: center;">
                <span style="display: inline-block; background-color: #16A34A; color: #FFFFFF; font-size: 11px; font-weight: bold; letter-spacing: 0.12em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-right: 8px;">
                  ✓ PAYMENT STATUS: PAID
                </span>
                <span style="font-size: 12px; color: #1B5E20; font-weight: 600;">
                  Verified Live via Paystack
                </span>
              </td>
            </tr>

            <!-- Content Area -->
            <tr>
              <td style="padding: 32px;">
                
                <!-- Reference Details Card -->
                <div style="background-color: #FDFBF7; border: 1px solid #DFD7C7; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align: top; width: 50%;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #775A19; font-weight: bold; display: block;">
                          Memorial Booking Reference
                        </span>
                        <strong style="font-size: 16px; color: #4D0011; font-family: monospace;">
                          ${bookingReference}
                        </strong>
                      </td>
                      <td style="vertical-align: top; width: 50%;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #775A19; font-weight: bold; display: block;">
                          Paystack Transaction Ref
                        </span>
                        <strong style="font-size: 13px; color: #1B1B20; font-family: monospace; word-break: break-all;">
                          ${paystackReference}
                        </strong>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding-top: 10px; border-top: 1px dashed #DFD7C7; margin-top: 10px;">
                        <span style="font-size: 12px; color: #554243;">
                          Payment Confirmed On: <strong>${formattedDate}</strong>
                        </span>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Section: Names of the Faithful Departed -->
                <h2 style="font-size: 17px; color: #4D0011; margin: 0 0 12px 0; border-bottom: 2px solid #DFD7C7; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">
                  Names of the Faithful Departed (${deceasedNames.length})
                </h2>
                <ul style="padding-left: 0; margin: 0 0 24px 0;">
                  ${deceasedListHtml}
                </ul>

                <!-- Optional Special Intention Notes -->
                ${notesSection}

                <!-- Section: Offering & Liturgical Stipend Details -->
                <h2 style="font-size: 17px; color: #4D0011; margin: 0 0 12px 0; border-bottom: 2px solid #DFD7C7; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">
                  Offering &amp; Submitter Details
                </h2>
                <table width="100%" style="font-size: 14px; margin-bottom: 24px; border-collapse: collapse;">
                  <tr style="border-bottom: 1px solid #F0EDF4;">
                    <td style="padding: 8px 0; color: #554243; width: 45%;">Mass Offering Amount:</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #16A34A; font-size: 18px;">${formattedAmount} (${currency})</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #F0EDF4;">
                    <td style="padding: 8px 0; color: #554243;">Payment Gateway:</td>
                    <td style="padding: 8px 0; color: #1B1B20; font-weight: 600;">Paystack Live Checkout (${channel || 'Direct'})</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #F0EDF4;">
                    <td style="padding: 8px 0; color: #554243;">Church Merchant Account:</td>
                    <td style="padding: 8px 0; color: #1B1B20;">Young and Chosen for Christ</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #F0EDF4;">
                    <td style="padding: 8px 0; color: #554243;">Requester Name:</td>
                    <td style="padding: 8px 0; color: #1B1B20; font-weight: 600;">${requesterName || 'Parishioner'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #554243;">Requester Email:</td>
                    <td style="padding: 8px 0; color: #4D0011; font-weight: bold;">
                      <a href="mailto:${requesterEmail}" style="color: #4D0011; text-decoration: underline;">${requesterEmail}</a>
                    </td>
                  </tr>
                </table>

                <!-- Solemn Closing Prayer -->
                <div style="background-color: #FDFBF7; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #DFD7C7; margin-bottom: 20px;">
                  <p style="font-style: italic; color: #4D0011; font-size: 14px; margin: 0 0 4px 0; font-weight: 500;">
                    “Requiem aeternam dona eis, Domine, et lux perpetua luceat eis.”
                  </p>
                  <span style="font-size: 12px; color: #775A19;">
                    May the souls of the faithful departed, through the mercy of God, rest in peace. Amen.
                  </span>
                </div>

                <p style="font-size: 11px; color: #887272; line-height: 1.5; margin: 0; text-align: center; border-top: 1px solid #DFD7C7; padding-top: 16px;">
                  This is an automated confirmation generated immediately upon verified Paystack payment.<br>
                  Young and Chosen for Christ Catholic Initiative • November Memorial Portal
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

/**
 * Builds Plain Text version of the confirmation email
 */
function buildMassIntentionText(booking) {
  const {
    bookingReference,
    paystackReference,
    deceasedNames = [],
    offeringAmount,
    currency = 'NGN',
    requesterName,
    requesterEmail,
    intentionNotes,
    paidAt
  } = booking;

  const formattedAmount = (typeof offeringAmount === 'number')
    ? '₦' + offeringAmount.toLocaleString('en-NG')
    : String(offeringAmount || '₦0');

  return `PAID MASS BOOKING CONFIRMATION – YCCCI
======================================================
Payment Status: PAID (Verified via Paystack Live)
Booking Reference: ${bookingReference}
Paystack Reference: ${paystackReference}
Date: ${paidAt || new Date().toISOString()}

NAMES OF THE FAITHFUL DEPARTED (${deceasedNames.length}):
${deceasedNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

${intentionNotes ? `SPECIAL INTENTION / PETITION:\n"${intentionNotes.trim()}"\n` : ''}
OFFERING DETAILS:
- Offering Amount: ${formattedAmount} (${currency})
- Church Merchant Account: Young and Chosen for Christ
- Submitter Name: ${requesterName || 'Parishioner'}
- Submitter Email: ${requesterEmail}

Requiem aeternam dona eis, Domine, et lux perpetua luceat eis.
Young and Chosen for Christ Catholic Initiative
======================================================`;
}

/**
 * Dispatches the Mass intention confirmation email.
 * Provider priority:
 *   1. Resend API      — if RESEND_API_KEY is set
 *   2. Brevo SMTP      — if BREVO_SMTP_USER and BREVO_SMTP_PASS are set (primary for this project)
 *   3. Gmail SMTP      — if GMAIL_USER and GMAIL_APP_PASSWORD are set (legacy fallback)
 *   4. Generic SMTP    — if SMTP_HOST is set (legacy fallback)
 *
 * Strictly sends ONLY after successful Paystack payment verification.
 * The recipient is ALWAYS the fixed church admin address from environment variables —
 * never the customer's address.
 *
 * @param {Object} booking
 * @returns {Promise<{ success: boolean, provider: string, messageId?: string }>}
 */
async function sendBookingConfirmationEmail(booking) {
  // Fixed recipient — always the church administration address, never customer-supplied
  const recipientEmail = (
    process.env.ADMIN_EMAIL ||
    process.env.MASS_BOOKING_EMAIL ||
    process.env.RECIPIENT_EMAIL ||
    'younganchoseforchrist@gmail.com'
  ).trim();

  const subject = `PAID MASS BOOKING CONFIRMATION – YCCCI [${booking.bookingReference}]`;
  const html = buildMassIntentionHtml(booking);
  const text = buildMassIntentionText(booking);

  // ------------------------------------------------------------------
  // PROVIDER 1: Resend API (used when RESEND_API_KEY is present)
  // ------------------------------------------------------------------
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== '') {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY.trim());
      // Use verified sender domain if configured, otherwise Resend's shared sandbox address
      const fromAddress = process.env.SENDER_EMAIL || 'YCCCI Mass Booking <onboarding@resend.dev>';

      const result = await resend.emails.send({
        from: fromAddress,
        to: recipientEmail,
        reply_to: booking.requesterEmail || undefined,
        subject,
        html,
        text
      });

      if (result.error) {
        throw new Error(result.error.message || 'Resend API returned an error');
      }

      console.log(`✅ [Email] Sent via Resend → ${recipientEmail} [${booking.bookingReference}]`);
      return { success: true, provider: 'Resend', messageId: result.data?.id };
    } catch (err) {
      console.error('❌ [Email] Resend failed:', err.message);
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // PROVIDER 2: Brevo SMTP (primary for this project)
  // Credentials: BREVO_SMTP_USER (your Brevo login email) +
  //              BREVO_SMTP_PASS (your Brevo API/SMTP key)
  // ------------------------------------------------------------------
  if (process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_PASS) {
    const brevoUser = process.env.BREVO_SMTP_USER.trim();
    const brevoPass = process.env.BREVO_SMTP_PASS.trim();

    // Guard: refuse to send if placeholder value was not replaced
    if (brevoUser === 'replace_with_your_brevo_login_email') {
      const msg = 'Brevo SMTP is not fully configured. Please set BREVO_SMTP_USER to your Brevo account login email in the .env file.';
      console.error(`❌ [Email] ${msg}`);
      throw new Error(msg);
    }

    try {
      const transporter = createBrevoTransporter();

      // Use SENDER_EMAIL from env, or fall back to the church admin address
      const fromAddress = process.env.SENDER_EMAIL || `YCCCI Memorial <${brevoUser}>`;

      const info = await transporter.sendMail({
        from: fromAddress,
        to: recipientEmail,
        replyTo: booking.requesterEmail || undefined,
        subject,
        html,
        text
      });

      console.log(`✅ [Email] Sent via Brevo SMTP → ${recipientEmail} [${booking.bookingReference}] (${info.messageId})`);
      return { success: true, provider: 'Brevo', messageId: info.messageId };
    } catch (err) {
      console.error('❌ [Email] Brevo SMTP failed:', err.message);
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // PROVIDER 3: Gmail App Password (legacy fallback)
  // ------------------------------------------------------------------
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER.trim(),
          pass: process.env.GMAIL_APP_PASSWORD.trim()
        }
      });

      const info = await transporter.sendMail({
        from: process.env.SENDER_EMAIL || `YCCCI Memorial <${process.env.GMAIL_USER.trim()}>`,
        to: recipientEmail,
        replyTo: booking.requesterEmail || undefined,
        subject,
        html,
        text
      });

      console.log(`✅ [Email] Sent via Gmail SMTP → ${recipientEmail} [${booking.bookingReference}]`);
      return { success: true, provider: 'Gmail', messageId: info.messageId };
    } catch (err) {
      console.error('❌ [Email] Gmail SMTP failed:', err.message);
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // PROVIDER 4: Generic SMTP (legacy fallback)
  // ------------------------------------------------------------------
  if (process.env.SMTP_HOST) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST.trim(),
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: process.env.SENDER_EMAIL || process.env.SMTP_USER,
        to: recipientEmail,
        replyTo: booking.requesterEmail || undefined,
        subject,
        html,
        text
      });

      console.log(`✅ [Email] Sent via generic SMTP → ${recipientEmail} [${booking.bookingReference}]`);
      return { success: true, provider: 'SMTP', messageId: info.messageId };
    } catch (err) {
      console.error('❌ [Email] Generic SMTP failed:', err.message);
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // No provider configured
  // ------------------------------------------------------------------
  const errMsg =
    'No email delivery provider is configured. ' +
    'Set BREVO_SMTP_USER + BREVO_SMTP_PASS in your .env file to use Brevo, ' +
    'or set RESEND_API_KEY to use Resend.';
  console.error(`❌ [Email] ${errMsg}`);
  throw new Error(errMsg);
}

module.exports = {
  buildMassIntentionHtml,
  buildMassIntentionText,
  sendBookingConfirmationEmail
};
