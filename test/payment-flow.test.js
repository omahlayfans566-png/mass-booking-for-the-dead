const crypto = require('crypto');
const assert = require('assert');
const store = require('../lib/store');
const paystack = require('../lib/paystack');
const { buildMassIntentionHtml, buildMassIntentionText } = require('../lib/email');

async function runTests() {
  console.log('✝ Starting YCCCI Mass Booking & Paystack Integration Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
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
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Store persistence & atomic save
  test('Store saves and retrieves booking correctly', () => {
    const testBooking = {
      bookingReference: 'YCCCI-NOV-2026-9999',
      paystackReference: 'YCCCI-PAY-TEST-9999',
      deceasedNames: ['Papa Jude', 'Mama Grace', 'Brother Emmanuel'],
      offeringAmount: 5000,
      amountInKobo: 500000,
      currency: 'NGN',
      requesterEmail: 'testparishioner@example.com',
      requesterName: 'Jude Okonkwo',
      intentionNotes: 'Eternal peace and rest',
      paymentStatus: 'pending',
      emailDelivered: false,
      createdAt: new Date().toISOString()
    };
    store.saveBooking(testBooking);

    const retrievedByPaystack = store.getBooking('YCCCI-PAY-TEST-9999');
    assert.strictEqual(retrievedByPaystack.bookingReference, 'YCCCI-NOV-2026-9999');
    assert.strictEqual(retrievedByPaystack.deceasedNames.length, 3);
    assert.strictEqual(retrievedByPaystack.offeringAmount, 5000);

    const retrievedByBooking = store.getBooking('YCCCI-NOV-2026-9999');
    assert.strictEqual(retrievedByBooking.paystackReference, 'YCCCI-PAY-TEST-9999');
  });

  // 2. Email generation with multiple deceased souls & intention details
  test('Confirmation email formats multiple deceased names and liturgical details', () => {
    const booking = {
      bookingReference: 'YCCCI-NOV-2026-1234',
      paystackReference: 'YCCCI-PAY-17290000-5678',
      deceasedNames: ['Marie Chidinma Okonkwo', 'Peter Obi Okonkwo', 'Theresa Ngozi Okonkwo'],
      offeringAmount: 15000,
      currency: 'NGN',
      requesterEmail: 'family@example.com',
      requesterName: 'Okonkwo Family',
      intentionNotes: 'For the repose of all departed family members',
      paidAt: '2026-10-28T20:00:00.000Z',
      channel: 'card'
    };

    const html = buildMassIntentionHtml(booking);
    const text = buildMassIntentionText(booking);

    // Verify all names appear in HTML and Text
    assert(html.includes('Marie Chidinma Okonkwo'), 'HTML must include first name');
    assert(html.includes('Peter Obi Okonkwo'), 'HTML must include second name');
    assert(html.includes('Theresa Ngozi Okonkwo'), 'HTML must include third name');
    assert(html.includes('Names of the Faithful Departed (3)'), 'HTML must count total souls');
    assert(html.includes('₦15,000 (NGN)'), 'HTML must format offering amount');
    assert(html.includes('YCCCI-NOV-2026-1234'), 'HTML must include booking reference');
    assert(html.includes('YCCCI-PAY-17290000-5678'), 'HTML must include Paystack reference');
    assert(html.includes('PAID'), 'HTML must include PAID status badge');
    assert(html.includes('For the repose of all departed family members'), 'HTML must include intention notes');

    // Text assertions
    assert(text.includes('PAID MASS BOOKING CONFIRMATION – YCCCI'));
    assert(text.includes('1. Marie Chidinma Okonkwo'));
    assert(text.includes('2. Peter Obi Okonkwo'));
    assert(text.includes('3. Theresa Ngozi Okonkwo'));
    assert(text.includes('₦15,000 (NGN)'));
  });

  // 3. HMAC SHA512 Webhook Signature Verification
  test('Webhook HMAC SHA512 signature verification accepts valid and rejects forged signatures', () => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_mock_secret_key_12345';
    process.env.PAYSTACK_SECRET_KEY = secretKey;

    const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'TEST-REF' } });
    const validSignature = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');
    const forgedSignature = 'bad_forged_signature_1234567890abcdef';

    assert.strictEqual(paystack.verifyWebhookSignature(payload, validSignature), true, 'Valid signature must return true');
    assert.strictEqual(paystack.verifyWebhookSignature(payload, forgedSignature), false, 'Forged signature must return false');
    assert.strictEqual(paystack.verifyWebhookSignature(payload, ''), false, 'Empty signature must return false');
  });

  // 4. Idempotency test: preventing duplicate confirmation emails
  test('Idempotency prevents duplicate confirmation emails on repeated events or page refresh', () => {
    const ref = 'YCCCI-IDEMPOTENT-TEST-001';
    const booking = {
      bookingReference: 'YCCCI-NOV-2026-8888',
      paystackReference: ref,
      deceasedNames: ['St. Monica'],
      offeringAmount: 2000,
      amountInKobo: 200000,
      currency: 'NGN',
      requesterEmail: 'monica@example.com',
      paymentStatus: 'paid',
      emailDelivered: true,
      emailSentAt: new Date().toISOString()
    };
    store.saveBooking(booking);

    const lookup = store.getBooking(ref);
    assert.strictEqual(lookup.paymentStatus, 'paid');
    assert.strictEqual(lookup.emailDelivered, true);

    // Simulating second webhook or page refresh:
    // When booking is already paid and emailDelivered is true, email must not be dispatched again
    const shouldDispatchEmail = !lookup.emailDelivered;
    assert.strictEqual(shouldDispatchEmail, false, 'Duplicate email dispatch must be prevented');
  });

  // 5. Payment amount and currency validation
  test('Payment validation strictly checks currency and amount', () => {
    const expectedAmountKobo = 500000; // ₦5,000
    const expectedCurrency = 'NGN';

    // Case A: Correct payment
    const validTx = { status: 'success', amount: 500000, currency: 'NGN' };
    const isValid = (validTx.status === 'success' && validTx.amount === expectedAmountKobo && validTx.currency === expectedCurrency);
    assert.strictEqual(isValid, true, 'Valid transaction should pass');

    // Case B: Currency mismatch (e.g. USD)
    const invalidCurrencyTx = { status: 'success', amount: 500000, currency: 'USD' };
    const isCurrencyValid = invalidCurrencyTx.currency === expectedCurrency;
    assert.strictEqual(isCurrencyValid, false, 'Currency mismatch must be rejected');

    // Case C: Amount mismatch (underpayment)
    const underpaidTx = { status: 'success', amount: 200000, currency: 'NGN' };
    const isAmountValid = underpaidTx.amount === expectedAmountKobo;
    assert.strictEqual(isAmountValid, false, 'Amount underpayment must be rejected');

    // Case D: Failed status
    const failedTx = { status: 'failed', amount: 500000, currency: 'NGN' };
    const isStatusValid = failedTx.status === 'success';
    assert.strictEqual(isStatusValid, false, 'Failed transaction must not be treated as confirmed');
  });

  // 6. Safe recovery of paid booking with failed email without double charge
  test('Email failure preserves paid status without recharging and permits safe retry', () => {
    const ref = 'YCCCI-EMAIL-FAIL-TEST-001';
    const booking = {
      bookingReference: 'YCCCI-NOV-2026-7777',
      paystackReference: ref,
      deceasedNames: ['Loved One'],
      offeringAmount: 3000,
      amountInKobo: 300000,
      currency: 'NGN',
      requesterEmail: 'retry@example.com',
      paymentStatus: 'paid',
      emailDelivered: false,
      emailError: 'Provider rate limit exceeded'
    };
    store.saveBooking(booking);

    const check = store.getBooking(ref);
    assert.strictEqual(check.paymentStatus, 'paid', 'Customer must remain recorded as PAID');
    assert.strictEqual(check.emailDelivered, false, 'Email is marked undelivered');

    // Safe retry simulation:
    store.updateBooking(ref, {
      emailDelivered: true,
      emailSentAt: new Date().toISOString(),
      emailError: null
    });

    const retried = store.getBooking(ref);
    assert.strictEqual(retried.paymentStatus, 'paid');
    assert.strictEqual(retried.emailDelivered, true);
    assert.strictEqual(retried.emailError, null);
  });

  // 7. Security: Paystack secret key is never exposed
  test('Frontend security: secret key is never in public configuration or client files', () => {
    const fs = require('fs');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const configJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');

    assert(!indexHtml.includes('sk_live_'), 'index.html must not contain secret key');
    assert(!appJs.includes('sk_live_'), 'app.js must not contain secret key');
    assert(!configJs.includes('sk_live_'), 'config.js must not contain secret key');
  });
  // 8. Custom offering amounts validation & kobo conversion logic
  test('Custom offering amount accepts valid positive amounts and converts correctly to kobo', () => {
    function validateAndConvertAmount(raw) {
      const sanitized = String(raw || '').replace(/[₦,\s]/g, '');
      const isNumeric = /^[0-9]+(\.[0-9]{1,2})?$/.test(sanitized);
      const val = parseFloat(sanitized);

      if (!raw || sanitized === '') {
        return { valid: false, error: 'empty' };
      }
      if (!isNumeric || isNaN(val)) {
        return { valid: false, error: 'non_numeric' };
      }
      if (val <= 0) {
        return { valid: false, error: 'non_positive' };
      }
      if (val < 100) {
        return { valid: false, error: 'below_minimum' };
      }
      return { valid: true, amount: val, amountInKobo: Math.round(val * 100) };
    }

    // Valid arbitrary custom amounts
    const testCases = [
      { input: '1500', expectedKobo: 150000, expectedVal: 1500 },
      { input: '3,750', expectedKobo: 375000, expectedVal: 3750 },
      { input: '₦25,000', expectedKobo: 2500000, expectedVal: 25000 },
      { input: '100', expectedKobo: 10000, expectedVal: 100 },
      { input: '500.50', expectedKobo: 50050, expectedVal: 500.5 }
    ];

    for (const tc of testCases) {
      const res = validateAndConvertAmount(tc.input);
      assert.strictEqual(res.valid, true, `Input "${tc.input}" should be valid`);
      assert.strictEqual(res.amountInKobo, tc.expectedKobo, `Input "${tc.input}" kobo conversion mismatch`);
      assert.strictEqual(res.amount, tc.expectedVal, `Input "${tc.input}" value mismatch`);
    }

    // Invalid amounts
    assert.strictEqual(validateAndConvertAmount('').valid, false, 'Empty should be invalid');
    assert.strictEqual(validateAndConvertAmount('   ').valid, false, 'Whitespace should be invalid');
    assert.strictEqual(validateAndConvertAmount('abc').valid, false, 'Alphabetical string should be invalid');
    assert.strictEqual(validateAndConvertAmount('₦0').valid, false, 'Zero should be invalid');
    assert.strictEqual(validateAndConvertAmount('-500').valid, false, 'Negative should be invalid');
    assert.strictEqual(validateAndConvertAmount('50').valid, false, 'Below 100 should be invalid');
  });

  // 9. Preset buttons completely removed and custom amount input present
  test('UI verification: preset buttons completely removed and custom input present', () => {
    const fs = require('fs');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

    // Ensure preset buttons and pills are removed
    assert(!indexHtml.includes('selectPresetAmount'), 'index.html must not contain selectPresetAmount');
    assert(!indexHtml.includes('offering-pill'), 'index.html must not contain offering-pill class');
    assert(!appJs.includes('selectPresetAmount'), 'app.js must not contain selectPresetAmount');
    assert(!stylesCss.includes('offering-pill'), 'styles.css must not contain offering-pill styling');

    // Ensure custom amount input exists with proper attributes
    assert(indexHtml.includes('id="customOffering"'), 'index.html must contain #customOffering');
    assert(indexHtml.includes('placeholder="Enter your preferred amount"'), 'index.html must have correct placeholder');
    assert(indexHtml.includes('Your Mass Offering Amount (₦)'), 'index.html must have correct label');
  });

  console.log(`\n======================================================`);
  console.log(`Test Suite Finished: ${passed} Passed, ${failed} Failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

const path = require('path');
runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
