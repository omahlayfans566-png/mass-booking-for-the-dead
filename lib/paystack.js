const https = require('https');
const crypto = require('crypto');

const PAYSTACK_BASE_URL = 'api.paystack.co';

/**
 * Make an HTTPS request to Paystack API
 */
function makePaystackRequest({ path, method = 'GET', data = null, secretKey }) {
  return new Promise((resolve, reject) => {
    const key = secretKey || process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      return reject(new Error('PAYSTACK_SECRET_KEY is not configured in environment variables.'));
    }

    const payloadString = data ? JSON.stringify(data) : null;

    const options = {
      hostname: PAYSTACK_BASE_URL,
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${key.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'YCCCI-Memorial-Mass-Booking/1.0'
      }
    };

    if (payloadString) {
      options.headers['Content-Length'] = Buffer.byteLength(payloadString);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');

      res.on('data', chunk => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300 && parsed.status === true) {
            resolve(parsed);
          } else {
            const err = new Error(parsed.message || `Paystack API returned status ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.paystackResponse = parsed;
            reject(err);
          }
        } catch (parseErr) {
          reject(new Error(`Failed to parse Paystack API response: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Paystack connection error: ${err.message}`));
    });

    if (payloadString) {
      req.write(payloadString);
    }

    req.end();
  });
}

const paystack = {
  /**
   * Initializes a Paystack Live transaction
   * @param {Object} params
   * @param {string} params.email - Customer email
   * @param {number} params.amountInKobo - Amount in kobo (NGN * 100)
   * @param {string} params.reference - Unique reference code
   * @param {string} params.callbackUrl - Browser return URL
   * @param {Object} params.metadata - Custom booking metadata
   */
  async initializeTransaction({ email, amountInKobo, reference, callbackUrl, metadata = {} }) {
    if (!email || !amountInKobo || !reference) {
      throw new Error('Email, amountInKobo, and reference are required to initialize Paystack transaction.');
    }

    const payload = {
      email,
      amount: amountInKobo,
      currency: 'NGN',
      reference,
      callback_url: callbackUrl,
      metadata
    };

    const response = await makePaystackRequest({
      path: '/transaction/initialize',
      method: 'POST',
      data: payload
    });

    return response.data; // { authorization_url, access_code, reference }
  },

  /**
   * Verifies a Paystack transaction by reference
   * @param {string} reference
   */
  async verifyTransaction(reference) {
    if (!reference) {
      throw new Error('Reference is required for Paystack verification.');
    }

    const response = await makePaystackRequest({
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      method: 'GET'
    });

    return response.data; // { status, reference, amount, currency, channel, paid_at, customer, ... }
  },

  /**
   * Verifies webhook HMAC SHA512 signature using PAYSTACK_SECRET_KEY
   * @param {Buffer|string} rawBody
   * @param {string} signatureHeader
   */
  verifyWebhookSignature(rawBody, signatureHeader) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey || !signatureHeader) return false;

    try {
      const hash = crypto
        .createHmac('sha512', secretKey.trim())
        .update(rawBody)
        .digest('hex');

      return hash === signatureHeader;
    } catch (err) {
      console.error('Signature verification error:', err.message);
      return false;
    }
  }
};

module.exports = paystack;
