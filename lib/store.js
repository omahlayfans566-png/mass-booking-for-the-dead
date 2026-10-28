const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'bookings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err.message);
  }
}

// In-memory cache for fast lookups
let cache = {};

// Load existing data from file if present
function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      cache = JSON.parse(raw);
    } else {
      cache = {};
      persistStore();
    }
  } catch (err) {
    console.error('Failed to load store from disk:', err.message);
    cache = {};
  }
}

// Atomically write cache to disk
function persistStore() {
  try {
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error('Failed to persist bookings to disk:', err.message);
  }
}

// Initialize on require
loadStore();

const store = {
  /**
   * Save a new booking or update existing one
   * @param {Object} booking
   */
  saveBooking(booking) {
    if (!booking) return null;
    const paystackRef = booking.paystackReference || booking.paymentReference;
    const bookingRef = booking.bookingReference;

    if (paystackRef) {
      cache[paystackRef] = { ...cache[paystackRef], ...booking };
    }
    if (bookingRef && (!paystackRef || cache[paystackRef])) {
      // Also index by booking reference for direct lookups
      cache[bookingRef] = cache[paystackRef] || booking;
    }

    persistStore();
    return cache[paystackRef] || cache[bookingRef];
  },

  /**
   * Find a booking by Paystack reference or Memorial booking reference
   * @param {string} reference
   */
  getBooking(reference) {
    if (!reference) return null;
    return cache[reference] || null;
  },

  /**
   * Update fields of a booking atomically
   * @param {string} reference
   * @param {Object} updates
   */
  updateBooking(reference, updates) {
    const existing = this.getBooking(reference);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    if (updated.paystackReference) {
      cache[updated.paystackReference] = updated;
    }
    if (updated.bookingReference) {
      cache[updated.bookingReference] = updated;
    }

    persistStore();
    return updated;
  },

  /**
   * Retrieve all bookings sorted by creation date descending
   */
  getAllBookings() {
    const unique = new Map();
    for (const key of Object.keys(cache)) {
      const item = cache[key];
      if (item && item.bookingReference) {
        unique.set(item.bookingReference, item);
      }
    }
    return Array.from(unique.values()).sort((a, b) => {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }
};

module.exports = store;
