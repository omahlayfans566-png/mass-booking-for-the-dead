// =============================================================================
// YCCCI November Mass Booking - Main Application Script
// =============================================================================

let selectedFile = null;
let deceasedCount = 1;

document.addEventListener('DOMContentLoaded', () => {
  initCinematicIntro();
  initLogos();
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

  if (prefersReducedMotion || alreadyPlayed) {
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
      // Trigger reflow
      void showEl.offsetWidth;
      showEl.classList.add('active');
    }
  }, 300);
}

function splitAndReveal() {
  const introOverlay = document.getElementById('introOverlay');
  if (!introOverlay || introOverlay.classList.contains('doors-open')) return;

  introOverlay.classList.add('doors-open');
  sessionStorage.setItem('yccci_intro_played', 'true');

  // Remove intro overlay from flow after transition finishes
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

  // Attempt to check if local logo exists; fallback seamlessly to Stitch emblem
  const localLogo = new Image();
  localLogo.src = YCCCI_CONFIG.LOCAL_LOGO_PATH;
  localLogo.onload = () => {
    // If local logo is placed by church, use it
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

  // Focus newly added input
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
// 5. COPY ACCOUNT NUMBER
// -----------------------------------------------------------------------------
function copyAccountNumber() {
  const acc = '1228821057';
  const badge = document.getElementById('copySuccessBadge');
  const btnText = document.getElementById('copyBtnText');

  const onCopied = () => {
    if (badge) badge.classList.remove('hidden');
    if (btnText) btnText.innerText = 'Copied!';
    setTimeout(() => {
      if (badge) badge.classList.add('hidden');
      if (btnText) btnText.innerText = 'Copy Account Number';
    }, 2500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(acc).then(onCopied).catch(() => {
      fallbackCopyText(acc, onCopied);
    });
  } else {
    fallbackCopyText(acc, onCopied);
  }
}

function fallbackCopyText(text, callback) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    if (callback) callback();
  } catch (err) {
    alert('Bank Account Number: ' + text);
  }
  document.body.removeChild(textArea);
}

// -----------------------------------------------------------------------------
// 6. PROOF OF PAYMENT FILE UPLOAD & VALIDATION
// -----------------------------------------------------------------------------
function triggerFileInput() {
  const input = document.getElementById('receiptFileInput');
  if (input) input.click();
}

function handleFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  processUploadedFile(file);
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropzone = document.getElementById('dropzoneEmpty');
  if (dropzone) dropzone.classList.add('border-primary', 'bg-surface-container-high');
}

function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropzone = document.getElementById('dropzoneEmpty');
  if (dropzone) dropzone.classList.remove('border-primary', 'bg-surface-container-high');
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropzone = document.getElementById('dropzoneEmpty');
  if (dropzone) dropzone.classList.remove('border-primary', 'bg-surface-container-high');

  const files = event.dataTransfer.files;
  if (files && files.length > 0) {
    const fileInput = document.getElementById('receiptFileInput');
    if (fileInput) fileInput.files = files;
    processUploadedFile(files[0]);
  }
}

function processUploadedFile(file) {
  const errorAlert = document.getElementById('uploadErrorAlert');
  const errorMsg = document.getElementById('uploadErrorMessage');

  if (!file) return;

  // Validate allowed extensions and mime types
  const allowedExtensions = ['png', 'jpg', 'jpeg', 'pdf'];
  const ext = file.name.split('.').pop().toLowerCase();
  const isValidExt = allowedExtensions.includes(ext);

  // Validate size: 10MB maximum
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (!isValidExt) {
    showUploadError('Invalid file type. Please upload a PNG, JPG, or PDF file.');
    selectedFile = null;
    return;
  }

  if (file.size > maxSize) {
    showUploadError('File exceeds 10MB limit. Please upload a smaller file or screenshot.');
    selectedFile = null;
    return;
  }

  // Clear any errors
  if (errorAlert) errorAlert.classList.add('hidden');

  selectedFile = file;

  // Show uploaded state
  const dropEmpty = document.getElementById('dropzoneEmpty');
  const dropUploaded = document.getElementById('dropzoneUploaded');
  const nameEl = document.getElementById('uploadedFileName');
  const sizeEl = document.getElementById('uploadedFileSize');

  if (nameEl) nameEl.innerText = file.name;
  if (sizeEl) {
    const sizeKB = (file.size / 1024).toFixed(0);
    const sizeFormatted = sizeKB > 1024 ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : sizeKB + ' KB';
    sizeEl.innerText = `${sizeFormatted} • Ready to submit`;
  }

  if (dropEmpty) dropEmpty.classList.add('hidden');
  if (dropUploaded) dropUploaded.classList.remove('hidden');
}

function showUploadError(msg) {
  const errorAlert = document.getElementById('uploadErrorAlert');
  const errorMsg = document.getElementById('uploadErrorMessage');
  if (errorMsg) errorMsg.innerText = msg;
  if (errorAlert) errorAlert.classList.remove('hidden');
}

// -----------------------------------------------------------------------------
// 7. FORM SUBMISSION (WITH FORMSUBMIT.CO SERVICE)
// -----------------------------------------------------------------------------
async function handleFormSubmit(event) {
  event.preventDefault();

  // Validate deceased names
  const inputs = document.querySelectorAll('.deceased-input');
  const names = [];
  inputs.forEach(input => {
    const val = input.value.trim();
    if (val) names.push(val);
  });

  if (names.length === 0) {
    alert('Please enter at least one name of a deceased loved one.');
    const firstInput = document.querySelector('.deceased-input');
    if (firstInput) firstInput.focus();
    return;
  }

  // Validate offering amount (accepts whole numbers, amounts with commas like 1,500 or 50,000)
  const offeringInput = document.getElementById('customOffering');
  const rawAmount = offeringInput ? offeringInput.value.trim() : '';
  const sanitizedAmount = rawAmount.replace(/[₦,\s]/g, '');
  const amountVal = parseFloat(sanitizedAmount);

  if (!rawAmount || isNaN(amountVal) || amountVal <= 0) {
    alert('Please enter a valid Mass offering amount.');
    if (offeringInput) {
      offeringInput.focus();
      offeringInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  // Validate receipt
  if (!selectedFile) {
    showUploadError('Please upload your bank transfer receipt or payment screenshot before submitting.');
    const uploadSection = document.getElementById('dropzoneEmpty');
    if (uploadSection) uploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Generate unique Memorial Reference Code
  const currentYear = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const referenceCode = `YCCCI-NOV-${currentYear}-${randomSuffix}`;

  // Form submission loading state
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const submitBtnIcon = document.getElementById('submitBtnIcon');

  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-80', 'cursor-not-allowed');
  submitBtnText.innerHTML = '<span class="btn-spinner mr-2"></span> Submitting Intention...';
  if (submitBtnIcon) submitBtnIcon.classList.add('hidden');

  // Build FormData for FormSubmit.co
  const formData = new FormData();
  formData.append('Booking_Reference', referenceCode);
  formData.append('Deceased_Souls', names.join(', '));
  formData.append('Total_Souls_Count', names.length.toString());
  formData.append('Offering_Amount_NGN', '₦' + amountVal.toLocaleString());
  formData.append('Bank_Paid_To', `${YCCCI_CONFIG.BANK_NAME} - ${YCCCI_CONFIG.ACCOUNT_NUMBER}`);
  formData.append('Submission_Date', new Date().toLocaleString());
  formData.append('attachment', selectedFile);

  // FormSubmit configuration fields
  formData.append('_subject', `New Mass Intention: ${names[0]} (${referenceCode})`);
  formData.append('_template', 'table');
  formData.append('_captcha', 'false');

  // Determine submission endpoint (calls backend /api/submit-intention)
  let submissionUrl = (YCCCI_CONFIG.API_ENDPOINT && YCCCI_CONFIG.API_ENDPOINT.trim()) || '/api/submit-intention';

  try {
    const response = await fetch(submissionUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json'
      }
    });

    const resData = await response.json().catch(() => null);

    if (response.ok && (!resData || resData.success !== false)) {
      // Backend & email provider confirmed message accepted!
      revealSuccessScreen(referenceCode);
    } else {
      let errDetails = (resData && resData.message)
        ? resData.message
        : 'Submission could not be completed. Please check your internet connection and try again.';
      alert(`Notice: ${errDetails}`);
      resetSubmitButton();
    }
  } catch (error) {
    console.error('Submission error:', error);
    alert('A network error occurred while submitting your intention. Please check your internet connection and try again.');
    resetSubmitButton();
  }
}

function resetSubmitButton() {
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const submitBtnIcon = document.getElementById('submitBtnIcon');

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-80', 'cursor-not-allowed');
  }
  if (submitBtnText) submitBtnText.innerText = 'SUBMIT MASS INTENTION';
  if (submitBtnIcon) submitBtnIcon.classList.remove('hidden');
}

// -----------------------------------------------------------------------------
// 8. DEDICATED CLEAN WHITE SUCCESS SCREEN WITH PROGRESSIVE GREEN CHECKMARK
// -----------------------------------------------------------------------------
function revealSuccessScreen(referenceCode) {
  const successScreen = document.getElementById('successScreen');
  const codeEl = document.getElementById('successReferenceCode');

  if (codeEl) codeEl.innerText = referenceCode;

  if (successScreen) {
    successScreen.classList.add('active-success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function resetFormForNewSubmission() {
  const successScreen = document.getElementById('successScreen');
  if (successScreen) successScreen.classList.remove('active-success');

  // Reset form fields
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

  // Reset file upload state
  selectedFile = null;
  const dropEmpty = document.getElementById('dropzoneEmpty');
  const dropUploaded = document.getElementById('dropzoneUploaded');
  const errorAlert = document.getElementById('uploadErrorAlert');
  if (dropEmpty) dropEmpty.classList.remove('hidden');
  if (dropUploaded) dropUploaded.classList.add('hidden');
  if (errorAlert) errorAlert.classList.add('hidden');

  // Clear custom offering amount input
  const customInput = document.getElementById('customOffering');
  if (customInput) customInput.value = '';

  resetSubmitButton();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
