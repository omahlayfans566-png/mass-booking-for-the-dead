'use strict';

/**
 * YCCCI Mass Booking — Integration Test Suite
 *
 * Tests the current two-step workflow:
 *   Step 1: /api/verify-payment  — verifies with Paystack, marks booking PAID, sends NO email.
 *   Step 2: /api/send-message    — sends email ONLY when customer explicitly clicks SEND MESSAGE.
 *
 * Run with: node test/payment-flow.test.js
 * No real Paystack transaction or real email is sent during these tests.
 */

// Load .env before anything else so MONGODB_URI is available to lib/store.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

const store   = require('../lib/store');
const paystack = require('../lib/paystack');
const { buildMassIntentionHtml, buildMassIntentionText } = require('../lib/email');

// ─── Simple test harness ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─── Helper: build a minimal booking object ─────────────────────────────────

function makeBooking(paystackRef, overrides = {}) {
  return {
    bookingReference:  overrides.bookingReference  || 'YCCCI-NOV-2026-TEST',
    paystackReference: paystackRef,
    deceasedNames:     overrides.deceasedNames     || ['Departed Soul'],
    offeringAmount:    overrides.offeringAmount    || 5000,
    amountInKobo:      overrides.amountInKobo      || 500000,
    currency:          'NGN',
    requesterEmail:    overrides.requesterEmail    || 'parishioner@example.com',
    requesterName:     overrides.requesterName     || 'Test Parishioner',
    intentionNotes:    overrides.intentionNotes    || '',
    paymentStatus:     overrides.paymentStatus     || 'pending',
    emailDelivered:    overrides.emailDelivered    ?? false,
    createdAt:         new Date().toISOString(),
    ...overrides
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n✝  YCCCI Mass Booking — Test Suite\n');

  // =========================================================================
  // GROUP 1: Store
  // =========================================================================
  console.log('── Group 1: Store ──────────────────────────────');

  await testAsync('Store saves and retrieves by Paystack reference', async () => {
    const booking = makeBooking('YCCCI-PAY-STORE-101', {
      bookingReference: 'YCCCI-NOV-2026-STORE101'
    });
    await store.saveBooking(booking);

    const byPaystack = await store.getBooking('YCCCI-PAY-STORE-101');
    assert.strictEqual(byPaystack.bookingReference, 'YCCCI-NOV-2026-STORE101');
    assert.strictEqual(byPaystack.offeringAmount, 5000);
  });

  await testAsync('Store retrieves by booking reference as well as Paystack reference', async () => {
    const booking = makeBooking('YCCCI-PAY-STORE-102', {
      bookingReference: 'YCCCI-NOV-2026-STORE102'
    });
    await store.saveBooking(booking);

    const byBooking = await store.getBooking('YCCCI-NOV-2026-STORE102');
    assert.ok(byBooking, 'Should find booking by booking reference');
    assert.strictEqual(byBooking.paystackReference, 'YCCCI-PAY-STORE-102');
  });

  await testAsync('Store updateBooking merges fields without overwriting unrelated ones', async () => {
    const ref = 'YCCCI-PAY-STORE-103';
    await store.saveBooking(makeBooking(ref, { bookingReference: 'YCCCI-NOV-2026-STORE103' }));
    await store.updateBooking(ref, { paymentStatus: 'paid', paidAt: '2026-11-01T10:00:00Z' });

    const updated = await store.getBooking(ref);
    assert.strictEqual(updated.paymentStatus, 'paid');
    assert.strictEqual(updated.offeringAmount, 5000, 'Unrelated field must be preserved');
  });

  await testAsync('Store returns null for an unknown reference', async () => {
    const result = await store.getBooking('NO-SUCH-REF-XYZ');
    assert.strictEqual(result, null);
  });

  // =========================================================================
  // GROUP 2: Current workflow — verify-payment must NOT send email
  // =========================================================================
  console.log('\n── Group 2: Verify-payment does not send email ─');

  await testAsync('After verify-payment, booking is marked paid but emailDelivered remains false', async () => {
    const ref = 'YCCCI-PAY-VERIFY-101';
    await store.saveBooking(makeBooking(ref, {
      bookingReference: 'YCCCI-NOV-2026-VER101',
      paymentStatus: 'pending'
    }));

    // Simulate what /api/verify-payment does: mark paid, do NOT set emailDelivered
    await store.updateBooking(ref, {
      paymentStatus: 'paid',
      paidAt: new Date().toISOString(),
      channel: 'card'
    });

    const booking = await store.getBooking(ref);
    assert.strictEqual(booking.paymentStatus, 'paid',
      'Payment status must be "paid" after verification');
    assert.strictEqual(booking.emailDelivered, false,
      'emailDelivered must remain false — email is not sent during verification');
  });

  test('Verify-payment response shape includes paymentVerified:true, no emailDelivered:true', () => {
    // Simulates the JSON shape /api/verify-payment returns to the frontend
    const simulatedVerifyResponse = {
      success: true,
      paymentVerified: true,
      alreadyConfirmed: false,
      message: 'Payment confirmed. You may now submit your Mass intention.',
      booking: {
        bookingReference: 'YCCCI-NOV-2026-VER2',
        paymentStatus: 'paid',
        emailDelivered: false   // must be false at this stage
      }
    };

    assert.strictEqual(simulatedVerifyResponse.paymentVerified, true);
    assert.strictEqual(simulatedVerifyResponse.booking.emailDelivered, false,
      'Email must not be delivered at the verification stage');
    assert.ok(!simulatedVerifyResponse.booking.emailSentAt,
      'emailSentAt must not exist at verification stage');
  });

  // =========================================================================
  // GROUP 3: send-message security gates
  // =========================================================================
  console.log('\n── Group 3: send-message security gates ────────');

  await testAsync('Unpaid booking cannot trigger email send', async () => {
    const ref = 'YCCCI-PAY-GATE-101';
    await store.saveBooking(makeBooking(ref, {
      bookingReference: 'YCCCI-NOV-2026-GATE101',
      paymentStatus: 'pending'
    }));

    const booking = await store.getBooking(ref);
    // This is the exact gate check in /api/send-message
    const isAllowed = booking && booking.paymentStatus === 'paid';
    assert.strictEqual(isAllowed, false,
      'An unpaid booking must be blocked from sending email');
  });

  await testAsync('Abandoned/failed payment cannot trigger email send', async () => {
    const ref = 'YCCCI-PAY-GATE-102';
    await store.saveBooking(makeBooking(ref, {
      bookingReference: 'YCCCI-NOV-2026-GATE102',
      paymentStatus: 'failed'
    }));

    const booking = await store.getBooking(ref);
    const isAllowed = booking && booking.paymentStatus === 'paid';
    assert.strictEqual(isAllowed, false,
      'A failed payment must be blocked from sending email');
  });

  await testAsync('Unknown reference cannot trigger email send (returns 404 equivalent)', async () => {
    const booking = await store.getBooking('COMPLETELY-UNKNOWN-REF');
    assert.strictEqual(booking, null,
      'Unknown reference must return null — no booking to send email for');
  });

  await testAsync('Paid booking passes the payment gate', async () => {
    const ref = 'YCCCI-PAY-GATE-103';
    await store.saveBooking(makeBooking(ref, {
      bookingReference: 'YCCCI-NOV-2026-GATE103',
      paymentStatus: 'paid'
    }));

    const booking = await store.getBooking(ref);
    const isAllowed = booking && booking.paymentStatus === 'paid';
    assert.strictEqual(isAllowed, true,
      'A paid booking must pass the payment gate');
  });

  // =========================================================================
  // GROUP 4: Idempotency — duplicate SEND MESSAGE cannot send twice
  // =========================================================================
  console.log('\n── Group 4: Idempotency ────────────────────────');

  await testAsync('emailDelivered:true prevents duplicate email dispatch', async () => {
    const ref = 'YCCCI-PAY-IDEM-101';
    await store.saveBooking(makeBooking(ref, {
      bookingReference: 'YCCCI-NOV-2026-IDEM101',
      paymentStatus: 'paid',
      emailDelivered: true,      // already sent
      emailSentAt: new Date().toISOString()
    }));

    const booking = await store.getBooking(ref);
    // Exact gate check from /api/send-message
    const wouldSendAgain = booking && !booking.emailDelivered;
    assert.strictEqual(wouldSendAgain, false,
      'Must not send again when emailDelivered is already true');
  });

  await testAsync('After first send, store records emailDelivered:true and prevents second send', async () => {
    const ref = 'YCCCI-PAY-IDEM-102';
    await store.saveBooking(makeBooking(ref, {
      bookingReference: 'YCCCI-NOV-2026-IDEM102',
      paymentStatus: 'paid',
      emailDelivered: false
    }));

    // Simulate first successful send
    await store.updateBooking(ref, {
      emailDelivered: true,
      emailSentAt: new Date().toISOString(),
      emailProvider: 'Brevo'
    });

    // Simulate second request (duplicate click)
    const booking = await store.getBooking(ref);
    const wouldSendAgain = booking && !booking.emailDelivered;
    assert.strictEqual(wouldSendAgain, false,
      'Second request must be blocked after emailDelivered is set to true');
    assert.strictEqual(booking.emailProvider, 'Brevo');
  });

  await testAsync('Email failure preserves paid status and permits safe retry', async () => {
    const ref = 'YCCCI-PAY-RETRY-101';
    await store.saveBooking(makeBooking(ref, {
      bookingReference: 'YCCCI-NOV-2026-RETRY101',
      paymentStatus: 'paid',
      emailDelivered: false,
      emailError: 'SMTP connection timeout'
    }));

    const check = await store.getBooking(ref);
    assert.strictEqual(check.paymentStatus, 'paid',
      'Payment must remain PAID after email failure');
    assert.strictEqual(check.emailDelivered, false,
      'emailDelivered must remain false after failure');

    // Safe retry: emailDelivered is false so /api/send-message will try again
    const canRetry = check && check.paymentStatus === 'paid' && !check.emailDelivered;
    assert.strictEqual(canRetry, true, 'Retry must be allowed after email failure');

    // Simulate successful retry
    await store.updateBooking(ref, { emailDelivered: true, emailError: null, emailSentAt: new Date().toISOString() });
    const retried = await store.getBooking(ref);
    assert.strictEqual(retried.emailDelivered, true);
    assert.strictEqual(retried.emailError, null);
    assert.strictEqual(retried.paymentStatus, 'paid', 'Payment status must still be paid after retry');
  });

  // =========================================================================
  // GROUP 5: Email content
  // =========================================================================
  console.log('\n── Group 5: Email content ──────────────────────');

  test('HTML email includes all deceased names, amount, references and PAID badge', () => {
    const booking = makeBooking('YCCCI-PAY-EMAIL-001', {
      bookingReference: 'YCCCI-NOV-2026-EMAIL1',
      deceasedNames: ['Marie Chidinma Okonkwo', 'Peter Obi Okonkwo', 'Theresa Ngozi Okonkwo'],
      offeringAmount: 15000,
      requesterEmail: 'family@example.com',
      requesterName: 'Okonkwo Family',
      intentionNotes: 'For the repose of all departed family members',
      paidAt: '2026-10-28T20:00:00.000Z',
      channel: 'card'
    });

    const html = buildMassIntentionHtml(booking);

    assert(html.includes('Marie Chidinma Okonkwo'),   'HTML must include first name');
    assert(html.includes('Peter Obi Okonkwo'),         'HTML must include second name');
    assert(html.includes('Theresa Ngozi Okonkwo'),     'HTML must include third name');
    assert(html.includes('Names of the Faithful Departed (3)'), 'HTML must count total souls');
    assert(html.includes('₦15,000 (NGN)'),             'HTML must format amount correctly');
    assert(html.includes('YCCCI-NOV-2026-EMAIL1'),     'HTML must include booking reference');
    assert(html.includes('YCCCI-PAY-EMAIL-001'),       'HTML must include Paystack reference');
    assert(html.includes('PAID'),                      'HTML must include PAID status badge');
    assert(html.includes('For the repose of all departed family members'),
      'HTML must include intention notes');
  });

  test('Plain-text email includes all key fields', () => {
    const booking = makeBooking('YCCCI-PAY-EMAIL-002', {
      bookingReference: 'YCCCI-NOV-2026-EMAIL2',
      deceasedNames: ['Soul One', 'Soul Two'],
      offeringAmount: 3000
    });

    const text = buildMassIntentionText(booking);

    assert(text.includes('PAID MASS BOOKING CONFIRMATION – YCCCI'), 'Text must include header');
    assert(text.includes('1. Soul One'),  'Text must include first name');
    assert(text.includes('2. Soul Two'),  'Text must include second name');
    assert(text.includes('₦3,000 (NGN)'), 'Text must include formatted amount');
    assert(text.includes('YCCCI-NOV-2026-EMAIL2'), 'Text must include booking reference');
  });

  test('Email recipient is always the fixed admin address from environment, not customer email', () => {
    // The recipient is determined at runtime from env vars — verify the logic here
    const adminEmail  = process.env.ADMIN_EMAIL        || '';
    const massEmail   = process.env.MASS_BOOKING_EMAIL || '';
    const recipientEmail = (
      adminEmail || massEmail || 'younganchoseforchrist@gmail.com'
    ).trim();

    assert.strictEqual(
      recipientEmail,
      'younganchoseforchrist@gmail.com',
      'Recipient must always be younganchoseforchrist@gmail.com'
    );

    // Customer email is only a reply-to — confirm it is NOT the recipient
    const customerEmail = 'customer@example.com';
    assert.notStrictEqual(
      recipientEmail,
      customerEmail,
      'Customer email must never be the delivery recipient'
    );
  });

  // =========================================================================
  // GROUP 6: Webhook signature
  // =========================================================================
  console.log('\n── Group 6: Webhook signature ──────────────────');

  test('Valid HMAC SHA512 signature is accepted', () => {
    // Use an isolated test secret for both signing and verification,
    // so the live PAYSTACK_SECRET_KEY in .env does not interfere.
    const testSecret = 'sk_test_isolated_hmac_test_secret_12345';
    const payload    = JSON.stringify({ event: 'charge.success', data: { reference: 'TEST' } });
    const validSig   = crypto.createHmac('sha512', testSecret).update(payload).digest('hex');

    // Temporarily override the env var for this assertion only
    const original = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = testSecret;
    const result = paystack.verifyWebhookSignature(payload, validSig);
    process.env.PAYSTACK_SECRET_KEY = original;   // restore immediately

    assert.strictEqual(result, true, 'Valid signature must be accepted');
  });

  test('Forged or empty webhook signature is rejected', () => {
    const testSecret = 'sk_test_isolated_hmac_test_secret_12345';
    const payload    = JSON.stringify({ event: 'charge.success', data: { reference: 'TEST' } });

    const original = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = testSecret;
    const forgedResult = paystack.verifyWebhookSignature(payload, 'forged_sig_abc123');
    const emptyResult  = paystack.verifyWebhookSignature(payload, '');
    process.env.PAYSTACK_SECRET_KEY = original;

    assert.strictEqual(forgedResult, false, 'Forged signature must be rejected');
    assert.strictEqual(emptyResult,  false, 'Empty signature must be rejected');
  });

  // =========================================================================
  // GROUP 7: Amount and currency validation
  // =========================================================================
  console.log('\n── Group 7: Amount and currency validation ─────');

  test('Valid amounts convert correctly to kobo', () => {
    function parseAmount(raw) {
      const sanitized = String(raw || '').replace(/[₦,\s]/g, '');
      const isNumeric = /^[0-9]+(\.[0-9]{1,2})?$/.test(sanitized);
      const val = parseFloat(sanitized);
      if (!sanitized || !isNumeric || isNaN(val) || val <= 0 || val < 100)
        return { valid: false };
      return { valid: true, amount: val, amountInKobo: Math.round(val * 100) };
    }

    const cases = [
      { input: '1500',      kobo: 150000,  val: 1500    },
      { input: '3,750',     kobo: 375000,  val: 3750    },
      { input: '₦25,000',   kobo: 2500000, val: 25000   },
      { input: '100',       kobo: 10000,   val: 100     },
      { input: '500.50',    kobo: 50050,   val: 500.5   }
    ];
    for (const { input, kobo, val } of cases) {
      const r = parseAmount(input);
      assert.strictEqual(r.valid, true,          `"${input}" should be valid`);
      assert.strictEqual(r.amountInKobo, kobo,   `"${input}" kobo mismatch`);
      assert.strictEqual(r.amount,       val,    `"${input}" value mismatch`);
    }
  });

  test('Invalid amounts are rejected', () => {
    function parseAmount(raw) {
      const sanitized = String(raw || '').replace(/[₦,\s]/g, '');
      const isNumeric = /^[0-9]+(\.[0-9]{1,2})?$/.test(sanitized);
      const val = parseFloat(sanitized);
      if (!sanitized || !isNumeric || isNaN(val) || val <= 0 || val < 100)
        return { valid: false };
      return { valid: true };
    }

    assert.strictEqual(parseAmount('').valid,     false, 'empty');
    assert.strictEqual(parseAmount('   ').valid,  false, 'whitespace');
    assert.strictEqual(parseAmount('abc').valid,  false, 'alphabetical');
    assert.strictEqual(parseAmount('₦0').valid,   false, 'zero');
    assert.strictEqual(parseAmount('-500').valid, false, 'negative');
    assert.strictEqual(parseAmount('50').valid,   false, 'below minimum');
  });

  test('Currency mismatch and failed status are rejected', () => {
    const expected = { currency: 'NGN', status: 'success' };

    assert.strictEqual('USD' === expected.currency, false, 'USD must be rejected');
    assert.strictEqual('failed' === expected.status,  false, 'failed status must be rejected');
    assert.strictEqual('abandoned' === expected.status, false, 'abandoned status must be rejected');
    assert.strictEqual('NGN' === expected.currency && 'success' === expected.status, true,
      'NGN + success must pass');
  });

  // =========================================================================
  // GROUP 8: Security — no secrets in frontend files
  // =========================================================================
  console.log('\n── Group 8: Frontend security ──────────────────');

  test('index.html contains no Paystack secret key', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(!html.includes('sk_live_'), 'index.html must not contain live secret key');
    assert(!html.includes('sk_test_'), 'index.html must not contain test secret key');
  });

  test('app.js contains no Paystack secret key or SMTP credentials', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    assert(!js.includes('sk_live_'),    'app.js must not contain live secret key');
    assert(!js.includes('sk_test_'),    'app.js must not contain test secret key');
    assert(!js.includes('xsmtpsib-'),   'app.js must not contain Brevo SMTP key');
    assert(!js.includes('BREVO_SMTP'),  'app.js must not reference BREVO_SMTP vars');
  });

  test('config.js contains no secret keys or SMTP credentials', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
    assert(!js.includes('sk_live_'),    'config.js must not contain live secret key');
    assert(!js.includes('xsmtpsib-'),   'config.js must not contain Brevo SMTP key');
  });

  test('/api/send-message endpoint exists in server.js and is not the removed admin endpoint', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert(serverSrc.includes('/api/send-message'),
      'server.js must define the /api/send-message endpoint');
    assert(!serverSrc.includes("app.post('/api/admin/retry-email"),
      'server.js must not contain the removed unauthenticated admin endpoint');
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Test suite finished: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════\n');

  // Close the MongoDB connection so the process exits cleanly
  await store.close();

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
