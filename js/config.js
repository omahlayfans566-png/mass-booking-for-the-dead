// YCCCI Mass Booking Configuration
// Update ADMIN_EMAIL to the church's official email to receive intentions & payment receipts via FormSubmit.co
const YCCCI_CONFIG = {
  // Administrator email where FormSubmit.co sends booking notifications & receipts
  ADMIN_EMAIL: 'ycccicatholic@gmail.com',

  // Configurable fallback or alternative submission endpoint (e.g. Formspree or custom webhook)
  // If you prefer Formspree, you can put: 'https://formspree.io/f/YOUR_FORM_ID'
  FORM_ENDPOINT: '',

  // Official Church Bank Details
  BANK_NAME: 'Zenith Bank',
  ACCOUNT_NAME: 'Young and Chosen for Christ',
  ACCOUNT_NUMBER: '1228821057',

  // Official Shop URL
  SHOP_URL: 'https://shop.youngandchosenforchrist.com',

  // Default logo path (checks local asset first, falls back to Google Stitch URL)
  LOCAL_LOGO_PATH: 'assets/yccci-logo.png',
  STITCH_LOGO_URL: 'https://lh3.googleusercontent.com/aida/AEtjO1WI4K9TKoNZFjxUZBts56d6wW8mwuzH0fbDWFP2h-h74UdYo_26jMsRxZGyS0HMja3xRBCz3sRkYmJqKX3irCOp0qhOHH5yA1KwCnIkOIwb8V62yB4QlCry-qjeLZH3cogSOS5t5Gw77DiX_0e5g4A-7HaD9SIuh6cZoqBSKdpxYa07-2gAe-55ofpGCnnAPAU_agb2jPBkdfOQP9Rc1PPxZMgguJlklr6oqM8FbJlfHye65eDKGVk',

  // Arched Sanctuary Image URL from Stitch design
  SANCTUARY_IMAGE_URL: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXnejfzFTy3U56iyZBpMFna_ml-6nXfhA7bbxJ3O6EzJgBrwx5MFFsJncEKK5Rv3jt694vmgFeJF8G4ZIC4nh5513xPD4h3jYf4iavKCfHeKoxXFkSffbJneDYHcvNmV9IPQ79mj8oUhR1ZpCxxxlqs12jLxpKkbEadPIhD5Pp_PD5UQipvhXJREKPDt0rgYqWN5ja1s-eXXAXrwWY5S4UMHnrkIbUUA9aZGKJ7VDClz9fRSrNQg'
};
