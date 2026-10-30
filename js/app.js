// =============================================================================
// YCCCI November Mass Booking - Main Application Script
// =============================================================================

let deceasedCount = 1;
let currentBookingDraft = null;

document.addEventListener('DOMContentLoaded', () => {
  initCinematicIntro();
  initLogos();
  checkPaymentReturnUrl();
});

// -----------------------------------------------------------------------------
// 1. CINEMATIC INTRO & SPLIT-SCREEN SEQUENCE
// -----------------------------------------------------------------------------
function initCinematicIntro() {
  const introOverlay = document.getElementById('introOverlay');
  if (!introOverlay) return;

  // Check prefers-reduced-motion or if intro was already played in this session
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alreadyPlayed = sessionStorage.getItem('yccci_intro_played');

  // Also skip intro immediately if returning with a payment reference
  const urlParams = new URLSearchParams(window.location.search);
  const hasPaymentReturn = urlParams.has('reference') || urlParams.has('trxref');

  if (prefersReducedMotion || alreadyPlayed || hasPaymentReturn) {
    skipIntro();
    return;
  }

  // Scene 1: 0 - 2s (Active by default)
  // Scene 2: 2 - 4s
  setTimeout(() => {
    switchIntroScene('introScene1', 'introScene2');
  }, 2200);

  // Scene 3: 4 - 6s
  setTimeout(() => {
    switchIntroScene('introScene2', 'introScene3');
  }, 4400);

  // Scene 4: Split Doors Reveal (6 - 8s)
  setTimeout(() => {
    splitAndReveal();
  }, 6600);
}

function switchIntroScene(hideId, showId) {
  const hideEl = document.getElementById(hideId);
  const showEl = document.getElementById(showId);
  if (hideEl) {
    hideEl.classList.remove('active');
    hideEl.classList.add('fade-out');
  }
  setTimeout(() => {
    if (hideEl) hideEl.style.display = 'none';
    if (showEl) {
      showEl.style.display = 'flex';
      void showEl.offsetWidth; // Trigger reflow
      showEl.classList.add('active');
    }
  }, 300);
}

function splitAndReveal() {
  const introOverlay = document.getElementById('introOverlay');
  if (!introOverlay || introOverlay.classList.contains('doors-open')) return;

  introOverlay.classList.add('doors-open');
  sessionStorage.setItem('yccci_intro_played', 'true');

  setTimeout(() => {
    introOverlay.classList.add('hidden-intro');
    document.body.classList.remove('intro-active');
  }, 1400);
}

function skipIntro() {
  const introOverlay = document.getElementById('introOverlay');
  if (!introOverlay) return;
  introOverlay.classList.add('doors-open');
  introOverlay.classList.add('hidden-intro');
  document.body.classList.remove('intro-active');
  sessionStorage.setItem('yccci_intro_played', 'true');
}

// -----------------------------------------------------------------------------
// 2. LOGO CONFIGURATION & LOCAL FALLBACK
// -----------------------------------------------------------------------------
function initLogos() {
  if (typeof YCCCI_CONFIG === 'undefined') return;

  const localLogo = new Image();
  localLogo.src = YCCCI_CONFIG.LOCAL_LOGO_PATH;
  localLogo.onload = () => {
    const logoEls = ['introLogoImg', 'navLogoImg', 'leftColLogoImg'];
    logoEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = YCCCI_CONFIG.LOCAL_LOGO_PATH;
    });
  };
}

// -----------------------------------------------------------------------------
// 3. DYNAMIC DECEASED NAMES MANAGEMENT
// -----------------------------------------------------------------------------
function addDeceasedRow() {
  deceasedCount++;
  const container = document.getElementById('deceasedContainer');
  const row = document.createElement('div');
  row.className = 'deceased-row p-space-md rounded-xl bg-surface-container-low shadow-sm space-y-space-sm relative border border-[#DFD7C7]/50 animate-fade-in';
  row.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="font-body text-xs text-secondary uppercase tracking-wider font-semibold">
        Additional Departed Soul #${deceasedCount}
      </span>
      <button type="button" onclick="removeDeceasedRow(this)" class="text-error font-body text-xs hover:underline flex items-center gap-1 font-medium">
        <span class="material-symbols-outlined text-[16px]">close</span> Remove
      </button>
    </div>
    <div class="space-y-space-xs">
      <label class="font-body text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        Full Name of Deceased <span class="text-primary">*</span>
      </label>
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">†</span>
        <input type="text" name="deceasedName[]" class="deceased-input w-full bg-surface-container-lowest text-on-surface pl-8 pr-4 py-2.5 rounded-lg text-sm md:text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 placeholder:text-outline/70 border border-[#DFD7C7]/60 transition-all" placeholder="e.g. Papa Jude Ekwueme" required>
      </div>
    </div>
  `;
  container.appendChild(row);

  const newInput = row.querySelector('.deceased-input');
  if (newInput) newInput.focus();
}

function removeDeceasedRow(buttonEl) {
  const row = buttonEl.closest('.deceased-row');
  if (row) {
    row.remove();
  }
}

// -----------------------------------------------------------------------------
// 4. STATUS ALERT BANNER
// -----------------------------------------------------------------------------
function showStatusAlert(title, message, isError = false) {
  const alert = document.getElementById('formStatusAlert');
  const titleEl = document.getElementById('formStatusTitle');
  const msgEl = document.getElementById('formStatusMessage');
  const iconEl = document.getElementById('formStatusIcon');

  if (!alert) return;

  if (titleEl) titleEl.innerText = title;
  if (msgEl) msgEl.innerText = message;

  if (isError) {
    alert.className = 'p-space-md rounded-xl text-sm flex items-start gap-space-sm border border-red-300 bg-red-50 text-red-900 shadow-sm';
    if (iconEl) {
      iconEl.innerText = 'error';
      iconEl.className = 'material-symbols-outlined text-[20px] shrink-0 mt-0.5 text-red-700';
    }
  } else {
    alert.className = 'p-space-md rounded-xl text-sm flex items-start gap-space-sm border border-[#DFD7C7] bg-[#FDFBF7] text-on-surface shadow-sm';
    if (iconEl) {
      iconEl.innerText = 'info';
      iconEl.className = 'material-symbols-outlined text-[20px] shrink-0 mt-0.5 text-secondary';
    }
  }

  alert.classList.remove('hidden');
  alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideStatusAlert() {
  const alert = document.getElementById('formStatusAlert');
  if (alert) alert.classList.add('hidden');
}

// -----------------------------------------------------------------------------
// 6. FORM SUBMISSION -> STEP 2: REVIEW MODAL
// -----------------------------------------------------------------------------
function handleFormSubmit(event) {
  event.preventDefault();
  hideStatusAlert();

  // 1. Validate deceased names
  const inputs = document.querySelectorAll('.deceased-input');
  const names = [];
  inputs.forEach(input => {
    const val = input.value.trim();
    if (val) names.push(val);
  });

  if (names.length === 0) {
    showStatusAlert('Deceased Name Required', 'Please enter at least one name of a deceased loved one.', true);
    const firstInput = document.querySelector('.deceased-input');
    if (firstInput) firstInput.focus();
    return;
  }

  // 2. Validate email
  const emailInput = document.getElementById('requesterEmail');
  const emailVal = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailVal || !emailRegex.test(emailVal)) {
    showStatusAlert('Valid Email Required', 'Please provide a valid email address to receive your payment receipt and booking confirmation.', true);
    if (emailInput) emailInput.focus();
    return;
  }

  // 3. Optional Submitter Name & Intention Notes
  const nameInput = document.getElementById('requesterName');
  const requesterName = nameInput ? nameInput.value.trim() : '';

  const notesInput = document.getElementById('intentionNotes');
  const intentionNotes = notesInput ? notesInput.value.trim() : '';

  // 4. Validate custom offering amount
  const offeringInput = document.getElementById('customOffering');
  const rawAmount = offeringInput ? offeringInput.value.trim() : '';
  const sanitizedAmount = rawAmount.replace(/[₦,\s]/g, '');

  if (!rawAmount || sanitizedAmount === '') {
    showStatusAlert('Offering Amount Required', 'Please enter your Mass offering amount in the field provided.', true);
    if (offeringInput) offeringInput.focus();
    return;
  }

  const isNumeric = /^[0-9]+(\.[0-9]{1,2})?$/.test(sanitizedAmount);
  const amountVal = parseFloat(sanitizedAmount);

  if (!isNumeric || isNaN(amountVal)) {
    showStatusAlert('Invalid Amount', 'Please enter a valid numeric offering amount without special symbols (e.g. 2500 or 5000).', true);
    if (offeringInput) offeringInput.focus();
    return;
  }

  if (amountVal <= 0) {
    showStatusAlert('Invalid Amount', 'Mass offering amount must be greater than zero.', true);
    if (offeringInput) offeringInput.focus();
    return;
  }

  if (amountVal < 100) {
    showStatusAlert('Minimum Offering Required', 'The minimum Mass offering amount is ₦100.', true);
    if (offeringInput) offeringInput.focus();
    return;
  }

  // Store validated booking draft for review
  currentBookingDraft = {
    deceasedNames: names,
    requesterEmail: emailVal,
    requesterName: requesterName || 'Parishioner',
    intentionNotes: intentionNotes,
    offeringAmount: amountVal
  };

  // Open Step 2: Review Booking Modal
  openReviewModal(currentBookingDraft);
}

// -----------------------------------------------------------------------------
// 7. REVIEW BOOKING MODAL (Step 2)
// -----------------------------------------------------------------------------
function openReviewModal(draft) {
  const modal = document.getElementById('bookingReviewModal');
  const listEl = document.getElementById('reviewDeceasedList');
  const nameEl = document.getElementById('reviewRequesterName');
  const emailEl = document.getElementById('reviewRequesterEmail');
  const amountEl = document.getElementById('reviewAmountTotal');
  const intentionRow = document.getElementById('reviewIntentionRow');
  const intentionText = document.getElementById('reviewIntentionText');
  const proceedBtn = document.getElementById('proceedToPaystackBtn');
  const proceedBtnText = document.getElementById('proceedBtnText');

  if (!modal) return;

  // Populate souls list
  if (listEl) {
    listEl.innerHTML = draft.deceasedNames
      .map(name => `<li class="flex items-center gap-1.5"><span class="text-secondary text-sm">†</span> <span>${escapeHtml(name)}</span></li>`)
      .join('');
  }

  // Populate submitter details
  if (nameEl) nameEl.innerText = draft.requesterName || 'Parishioner';
  if (emailEl) emailEl.innerText = draft.requesterEmail;
  if (amountEl) amountEl.innerText = `₦${draft.offeringAmount.toLocaleString()} NGN`;

  // Intention notes
  if (draft.intentionNotes && draft.intentionNotes.length > 0) {
    if (intentionText) intentionText.innerText = `“${draft.intentionNotes}”`;
    if (intentionRow) intentionRow.classList.remove('hidden');
  } else {
    if (intentionRow) intentionRow.classList.add('hidden');
  }

  // Reset button state
  if (proceedBtn) {
    proceedBtn.disabled = false;
    proceedBtn.classList.remove('opacity-75', 'cursor-not-allowed');
  }
  if (proceedBtnText) {
    proceedBtnText.innerText = `PROCEED TO PAYSTACK (₦${draft.offeringAmount.toLocaleString()})`;
  }

  modal.classList.add('active-modal');
  document.body.style.overflow = 'hidden';
}

function closeReviewModal() {
  const modal = document.getElementById('bookingReviewModal');
  if (modal) {
    modal.classList.remove('active-modal');
    document.body.style.overflow = '';
  }
}

// -----------------------------------------------------------------------------
// 8. INITIALIZE PAYSTACK TRANSACTION & REDIRECT (Step 3)
// -----------------------------------------------------------------------------
async function proceedToPaystackPayment() {
  if (!currentBookingDraft) return;

  const btn = document.getElementById('proceedToPaystackBtn');
  const btnText = document.getElementById('proceedBtnText');
  const btnIcon = document.getElementById('proceedBtnIcon');

  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
  }
  if (btnText) {
    btnText.innerHTML = '<span class="btn-spinner mr-2"></span> Connecting to Paystack...';
  }
  if (btnIcon) btnIcon.classList.add('hidden');

  try {
    const endpoint = (typeof YCCCI_CONFIG !== 'undefined' && YCCCI_CONFIG.API_INIT_PAYMENT)
      ? YCCCI_CONFIG.API_INIT_PAYMENT
      : '/api/initialize-payment';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(currentBookingDraft)
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data && data.success && data.authorization_url) {
      // Save local reference for session continuity
      sessionStorage.setItem('yccci_pending_ref', data.reference);
      sessionStorage.setItem('yccci_pending_booking', JSON.stringify({
        bookingReference: data.bookingReference,
        paystackReference: data.reference,
        ...currentBookingDraft
      }));

      // Redirect user to official Paystack Checkout
      window.location.href = data.authorization_url;
    } else {
      // Show a professional, user-friendly message — never expose raw backend errors
      showModalPaymentError(
        'We\'re temporarily unable to initialize your payment. Your booking information has been retained. Please try again shortly or contact the church administration for assistance.'
      );
      resetProceedButton();
    }
  } catch (err) {
    // Network or connection failure — friendly message, no technical detail
    showModalPaymentError(
      'A connection error occurred while reaching the payment gateway. Please check your internet connection and try again.'
    );
    resetProceedButton();
  }
}

function resetProceedButton() {
  const btn = document.getElementById('proceedToPaystackBtn');
  const btnText = document.getElementById('proceedBtnText');
  const btnIcon = document.getElementById('proceedBtnIcon');

  if (btn) {
    btn.disabled = false;
    btn.classList.remove('opacity-75', 'cursor-not-allowed');
  }
  if (btnText && currentBookingDraft) {
    btnText.innerText = `PROCEED TO PAYSTACK (₦${currentBookingDraft.offeringAmount.toLocaleString()})`;
  }
  if (btnIcon) btnIcon.classList.remove('hidden');
}

/**
 * Show a professional error message inside the booking review modal.
 * Never exposes raw backend error messages or technical details to the customer.
 */
function showModalPaymentError(message) {
  // Remove any existing error banner first
  const existing = document.getElementById('modalPaymentError');
  if (existing) existing.remove();

  const modal = document.getElementById('bookingReviewModal');
  if (!modal) return;

  const banner = document.createElement('div');
  banner.id = 'modalPaymentError';
  banner.className = 'p-3 rounded-xl text-sm flex items-start gap-2 bg-red-50 border border-red-200 text-red-900 shadow-sm mb-2';
  banner.innerHTML = `
    <span class="material-symbols-outlined text-[18px] shrink-0 mt-0.5 text-red-600">error</span>
    <div class="flex-1">
      <p class="font-semibold text-sm">Payment Unavailable</p>
      <p class="text-xs mt-0.5 leading-relaxed">${escapeHtml(message)}</p>
    </div>
    <button type="button" onclick="document.getElementById('modalPaymentError').remove()" class="text-xs text-red-700 font-semibold hover:underline shrink-0">✕</button>
  `;

  // Insert the banner above the action buttons inside the modal body
  const actionArea = document.getElementById('proceedToPaystackBtn');
  if (actionArea && actionArea.parentNode) {
    actionArea.parentNode.insertBefore(banner, actionArea);
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// -----------------------------------------------------------------------------
// 9. VERIFY PAYMENT ON RETURN FROM PAYSTACK (Steps 4, 5, 8)
// -----------------------------------------------------------------------------
async function checkPaymentReturnUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const reference = urlParams.get('reference') || urlParams.get('trxref');

  if (!reference) return;

  // Show verifying overlay
  const verifyingOverlay = document.getElementById('verifyingOverlay');
  if (verifyingOverlay) {
    verifyingOverlay.classList.add('active-modal');
  }

  try {
    const endpoint = (typeof YCCCI_CONFIG !== 'undefined' && YCCCI_CONFIG.API_VERIFY_PAYMENT)
      ? `${YCCCI_CONFIG.API_VERIFY_PAYMENT}/${encodeURIComponent(reference)}`
      : `/api/verify-payment/${encodeURIComponent(reference)}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const data = await response.json().catch(() => null);

    // Remove query params from browser URL to prevent re-verification on refresh
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (verifyingOverlay) {
      verifyingOverlay.classList.remove('active-modal');
    }

    if (response.ok && data && data.success && data.paymentVerified && data.booking) {
      // Payment verified — reveal success screen with SEND MESSAGE button
      revealSuccessScreen(data.booking, reference, !!data.alreadyConfirmed);
    } else {
      const errMsg = (data && data.message)
        ? data.message
        : 'Payment could not be verified. If your account was debited, please contact younganchoseforchrist@gmail.com with reference ' + reference;
      showStatusAlert('Payment Verification Notice', errMsg, true);
    }
  } catch (err) {
    console.error('Verification error:', err);
    if (verifyingOverlay) {
      verifyingOverlay.classList.remove('active-modal');
    }
    showStatusAlert('Connection Error', 'Unable to complete server payment verification. Please check your internet connection or contact church administration.', true);
  }
}

// -----------------------------------------------------------------------------
// 10. REVEAL DEDICATED SUCCESS SCREEN
//     Shows payment confirmation details and the SEND MESSAGE button.
//     alreadyConfirmed = true means the email was previously sent (idempotent revisit).
// -----------------------------------------------------------------------------
function revealSuccessScreen(booking, paystackReference, alreadyConfirmed) {
  const successScreen = document.getElementById('successScreen');
  const codeEl = document.getElementById('successReferenceCode');
  const paystackRefEl = document.getElementById('successPaystackRef');
  const amountEl = document.getElementById('successAmountPaid');
  const soulsListEl = document.getElementById('successDeceasedList');

  if (codeEl) codeEl.innerText = booking.bookingReference || 'YCCCI-NOV';
  if (paystackRefEl) paystackRefEl.innerText = booking.paystackReference || paystackReference || 'N/A';
  if (amountEl) {
    const amt = typeof booking.offeringAmount === 'number'
      ? '₦' + booking.offeringAmount.toLocaleString() + ' NGN'
      : String(booking.offeringAmount || '₦0');
    amountEl.innerText = amt;
  }

  if (soulsListEl && Array.isArray(booking.deceasedNames)) {
    soulsListEl.innerHTML = booking.deceasedNames
      .map(name => `<li class="flex items-center gap-1.5"><span class="text-secondary font-bold">†</span> <strong class="text-on-surface">${escapeHtml(name)}</strong></li>`)
      .join('');
  }

  // Store reference for the SEND MESSAGE button to use
  const ref = paystackReference || booking.paystackReference || '';

  // Inject SEND MESSAGE section above the "Submit another" button
  const returnBtn = successScreen ? successScreen.querySelector('button[onclick="resetFormForNewSubmission()"]') : null;
  if (returnBtn) {
    // Remove any previously injected send section (safe for idempotent revisits)
    const existing = document.getElementById('sendMessageSection');
    if (existing) existing.remove();

    const sendSection = document.createElement('div');
    sendSection.id = 'sendMessageSection';
    sendSection.className = 'pt-2 space-y-3';

    if (alreadyConfirmed) {
      // Email was already sent on a previous visit — show confirmation, no button needed
      sendSection.innerHTML = `
        <div class="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm font-semibold">
          <span class="material-symbols-outlined text-[18px]">check_circle</span>
          Your Mass intention has already been submitted successfully.
        </div>`;
    } else {
      sendSection.innerHTML = `
        <p class="text-sm text-on-surface-variant text-center">
          Your payment is confirmed. Click below to submit your Mass intention to the church administration.
        </p>
        <button
          type="button"
          id="sendMessageBtn"
          onclick="sendMessage('${escapeHtml(ref)}')"
          class="w-full py-4 px-6 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-all shadow-md hover:shadow-xl flex items-center justify-center gap-2 font-display text-lg tracking-wide group"
        >
          <span class="text-secondary-fixed text-lg">†</span>
          <span id="sendMessageBtnText" class="font-semibold">SEND MESSAGE</span>
          <span class="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform" id="sendMessageBtnIcon">send</span>
        </button>
        <div id="sendMessageResult" class="hidden"></div>`;
    }

    returnBtn.parentNode.insertBefore(sendSection, returnBtn);
  }

  if (successScreen) {
    successScreen.classList.add('active-success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Clear session draft
  sessionStorage.removeItem('yccci_pending_ref');
  sessionStorage.removeItem('yccci_pending_booking');
}

// -----------------------------------------------------------------------------
// 11. SEND MESSAGE — called when customer clicks the SEND MESSAGE button.
//     POSTs the verified payment reference to /api/send-message.
//     The backend confirms payment is paid, then sends via Brevo SMTP.
//     Customer stays on this page. Success or error shown inline.
// -----------------------------------------------------------------------------
async function sendMessage(reference) {
  const btn = document.getElementById('sendMessageBtn');
  const btnText = document.getElementById('sendMessageBtnText');
  const btnIcon = document.getElementById('sendMessageBtnIcon');
  const resultEl = document.getElementById('sendMessageResult');

  if (!reference) {
    if (resultEl) {
      resultEl.className = 'mt-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium';
      resultEl.innerText = 'Missing payment reference. Please contact support.';
      resultEl.classList.remove('hidden');
    }
    return;
  }

  // Disable button and show loading state
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
  }
  if (btnText) btnText.innerHTML = '<span class="btn-spinner mr-2"></span> Sending...';
  if (btnIcon) btnIcon.classList.add('hidden');
  if (resultEl) resultEl.classList.add('hidden');

  try {
    const baseUrl = (typeof YCCCI_CONFIG !== 'undefined' && YCCCI_CONFIG.BACKEND_URL)
      ? YCCCI_CONFIG.BACKEND_URL.replace(/\/+$/, '')
      : '';
    const endpoint = `${baseUrl}/api/send-message`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ reference })
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data && data.success) {
      // Success — replace the button with a permanent confirmation message
      const sendSection = document.getElementById('sendMessageSection');
      if (sendSection) {
        sendSection.innerHTML = `
          <div class="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm font-semibold">
            <span class="material-symbols-outlined text-[18px]">check_circle</span>
            Your Mass intention has been submitted successfully. God bless you.
          </div>`;
      }
    } else {
      // Error — restore the button so customer can retry
      const errMsg = (data && data.message)
        ? data.message
        : 'Unable to submit your intention. Please try again.';

      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
      }
      if (btnText) btnText.innerText = 'SEND MESSAGE';
      if (btnIcon) btnIcon.classList.remove('hidden');

      if (resultEl) {
        resultEl.className = 'mt-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm';
        resultEl.innerText = errMsg;
        resultEl.classList.remove('hidden');
      }
    }
  } catch (err) {
    // Network error — restore button for retry
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
    if (btnText) btnText.innerText = 'SEND MESSAGE';
    if (btnIcon) btnIcon.classList.remove('hidden');

    if (resultEl) {
      resultEl.className = 'mt-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm';
      resultEl.innerText = 'A network error occurred. Please check your connection and try again.';
      resultEl.classList.remove('hidden');
    }
  }
}

function resetFormForNewSubmission() {
  const successScreen = document.getElementById('successScreen');
  if (successScreen) successScreen.classList.remove('active-success');

  const form = document.getElementById('massIntentionForm');
  if (form) form.reset();

  // Reset deceased rows to single row
  const container = document.getElementById('deceasedContainer');
  if (container) {
    container.innerHTML = `
      <div class="deceased-row p-space-md rounded-xl bg-surface-container-low shadow-sm space-y-space-sm relative border border-[#DFD7C7]/50">
        <div class="space-y-space-xs">
          <label class="font-body text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Full Name of Deceased <span class="text-primary">*</span>
          </label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">†</span>
            <input type="text" name="deceasedName[]" class="deceased-input w-full bg-surface-container-lowest text-on-surface pl-8 pr-4 py-2.5 rounded-lg text-sm md:text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary/50 placeholder:text-outline/70 border border-[#DFD7C7]/60 transition-all" placeholder="e.g. Marie Chidinma Okonkwo" required>
          </div>
        </div>
      </div>
    `;
    deceasedCount = 1;
  }

  // Clear custom offering amount
  const customInput = document.getElementById('customOffering');
  if (customInput) customInput.value = '';

  currentBookingDraft = null;
  hideStatusAlert();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helper: Escape HTML strings
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
