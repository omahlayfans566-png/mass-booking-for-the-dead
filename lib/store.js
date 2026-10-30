'use strict';

/**
 * lib/store.js — MongoDB Atlas booking store
 *
 * Replaces the previous flat-file (bookings.json) implementation.
 * All four public functions are async and return Promises.
 *
 * Required environment variable:
 *   MONGODB_URI — Atlas connection string, e.g.
 *   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/yccci_bookings
 *
 * Collection: "bookings"
 * Indexes:
 *   - paystackReference  (unique)
 *   - bookingReference   (unique)
 *
 * No credentials are hardcoded. If MONGODB_URI is absent the functions throw
 * immediately so the caller (server.js) surfaces a clear 500 error rather than
 * silently losing booking data.
 */

const dns = require('dns');
const { MongoClient } = require('mongodb');

// Use Google's public DNS so the mongodb+srv:// SRV lookup always resolves,
// even on networks whose local DNS resolver doesn't support SRV record queries.
dns.setServers(['8.8.8.8', '8.8.4.4']);

// ─── Connection state ────────────────────────────────────────────────────────

let _client = null;      // MongoClient singleton
let _db     = null;      // Database handle
let _col    = null;      // Collection handle
let _connecting = null;  // In-flight connect promise (prevents parallel connects)

const DB_NAME  = 'yccci_bookings';
const COL_NAME = 'bookings';

/**
 * Returns the bookings collection, connecting and creating indexes on first call.
 * Subsequent calls reuse the open connection.
 */
async function getCollection() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.trim() === '') {
    throw new Error(
      'MONGODB_URI is not configured. ' +
      'Add it to your .env file locally or to Render Environment settings.'
    );
  }

  // Already connected
  if (_col) return _col;

  // Connection already in progress — wait for it
  if (_connecting) return _connecting;

  // Start a new connection
  _connecting = (async () => {
    try {
      _client = new MongoClient(uri.trim(), {
        // Keep alive while Express server is running
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      });

      await _client.connect();
      _db  = _client.db(DB_NAME);
      _col = _db.collection(COL_NAME);

      // Create indexes — idempotent, safe to call on every startup
      await _col.createIndex(
        { paystackReference: 1 },
        { unique: true, sparse: true, name: 'idx_paystackRef' }
      );
      await _col.createIndex(
        { bookingReference: 1 },
        { unique: true, sparse: true, name: 'idx_bookingRef' }
      );

      console.log(`✅ [Store] Connected to MongoDB Atlas (${DB_NAME}.${COL_NAME})`);
      _connecting = null;
      return _col;
    } catch (err) {
      // Reset so the next request can retry
      _client     = null;
      _db         = null;
      _col        = null;
      _connecting = null;
      throw new Error(`MongoDB connection failed: ${err.message}`);
    }
  })();

  return _connecting;
}

/**
 * Strip MongoDB internal _id from a document before returning to callers.
 * @param {object|null} doc
 * @returns {object|null}
 */
function clean(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;  // eslint-disable-line no-unused-vars
  return rest;
}

// ─── Public API ──────────────────────────────────────────────────────────────

const store = {
  /**
   * Save a new booking record.
   * Uses upsert on paystackReference so retries are safe.
   * @param {object} booking
   * @returns {Promise<object>} the saved booking (without _id)
   */
  async saveBooking(booking) {
    if (!booking) return null;

    const col = await getCollection();
    const paystackRef = booking.paystackReference || booking.paymentReference;
    const bookingRef  = booking.bookingReference;

    if (!paystackRef && !bookingRef) {
      throw new Error('saveBooking: booking must have paystackReference or bookingReference');
    }

    // Upsert by paystackReference (primary key for payment flow)
    const filter = paystackRef
      ? { paystackReference: paystackRef }
      : { bookingReference: bookingRef };

    const doc = {
      ...booking,
      updatedAt: new Date().toISOString()
    };

    await col.updateOne(
      filter,
      { $set: doc },
      { upsert: true }
    );

    // Return the saved document
    const saved = await col.findOne(filter);
    return clean(saved);
  },

  /**
   * Find a booking by Paystack reference OR booking reference.
   * Returns null if not found.
   * @param {string} reference
   * @returns {Promise<object|null>}
   */
  async getBooking(reference) {
    if (!reference) return null;

    const col = await getCollection();
    const doc = await col.findOne({
      $or: [
        { paystackReference: reference },
        { bookingReference:  reference }
      ]
    });

    return clean(doc);
  },

  /**
   * Merge updates into an existing booking.
   * Looks up by paystackReference or bookingReference.
   * Returns the updated document, or null if not found.
   * @param {string} reference
   * @param {object} updates
   * @returns {Promise<object|null>}
   */
  async updateBooking(reference, updates) {
    if (!reference) return null;

    const col = await getCollection();
    const filter = {
      $or: [
        { paystackReference: reference },
        { bookingReference:  reference }
      ]
    };

    const result = await col.findOneAndUpdate(
      filter,
      {
        $set: {
          ...updates,
          updatedAt: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    );

    // mongodb v6: findOneAndUpdate returns the document directly (not result.value)
    return clean(result);
  },

  /**
   * Return all bookings sorted by creation date descending.
   * @returns {Promise<object[]>}
   */
  async getAllBookings() {
    const col = await getCollection();
    const docs = await col
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map(clean);
  },

  /**
   * Gracefully close the MongoDB connection.
   * Call this on process exit or in tests after all assertions.
   */
  async close() {
    if (_client) {
      await _client.close();
      _client = null;
      _db     = null;
      _col    = null;
      console.log('[Store] MongoDB connection closed.');
    }
  }
};

module.exports = store;
