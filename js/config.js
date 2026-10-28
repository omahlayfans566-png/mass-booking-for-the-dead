// =============================================================================
// YCCCI Mass Booking & Paystack Payment Configuration
// =============================================================================
const YCCCI_CONFIG = {
  // Official Administrator Email where Mass intentions and payment confirmations are delivered
  ADMIN_EMAIL: 'youngchosenforchrist@gmail.com',

  // ---------------------------------------------------------------------------
  // RENDER BACKEND WEB SERVICE URL
  // If your website is deployed as a Render Static Site and your backend is
  // deployed as a separate Render Web Service, enter your backend Web Service URL here:
  // e.g. BACKEND_URL: 'https://mass-booking-for-the-dead-api.onrender.com'
  // Leave empty ('') for local development or when backend and frontend are hosted together.
  // ---------------------------------------------------------------------------
  BACKEND_URL: 'https://mass-booking-for-the-dead-api.onrender.com',

  // Currency
  CURRENCY: 'NGN',
  CURRENCY_SYMBOL: '₦',

  // Backend API Endpoints (dynamically prefixed with BACKEND_URL when configured)
  get API_INIT_PAYMENT() {
    return (this.BACKEND_URL ? this.BACKEND_URL.replace(/\/+$/, '') : '') + '/api/initialize-payment';
  },
  get API_VERIFY_PAYMENT() {
    return (this.BACKEND_URL ? this.BACKEND_URL.replace(/\/+$/, '') : '') + '/api/verify-payment';
  },
  get API_CONFIG() {
    return (this.BACKEND_URL ? this.BACKEND_URL.replace(/\/+$/, '') : '') + '/api/config';
  },

  // Official Church Bank Details (informational only; payments are processed via Paystack)
  BANK_NAME: 'Zenith Bank',
  ACCOUNT_NAME: 'Young and Chosen for Christ',
  ACCOUNT_NUMBER: '1228821057',

  // Official Shop URL
  SHOP_URL: 'https://shop.youngandchosenforchrist.com',

  // Official logo paths
  LOCAL_LOGO_PATH: 'assets/image.png',
  STITCH_LOGO_URL: 'assets/image.png',

  // Arched Sanctuary Image URL
  SANCTUARY_IMAGE_URL: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXnejfzFTy3U56iyZBpMFna_ml-6nXfhA7bbxJ3O6EzJgBrwx5MFFsJncEKK5Rv3jt694vmgFeJF8G4ZIC4nh5513xPD4h3jYf4iavKCfHeKoxXFkSffbJneDYHcvNmV9IPQ79mj8oUhR1ZpCxxxlqs12jLxpKkbEadPIhD5Pp_PD5UQipvhXJREKPDt0rgYqWN5ja1s-eXXAXrwWY5S4UMHnrkIbUUA9aZGKJ7VDClz9fRSrNQg'
};
