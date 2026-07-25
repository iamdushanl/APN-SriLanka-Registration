// ============================================================
// Aviation Professionals Network of Sri Lanka
// Backend — Google Apps Script (Code.gs)
// Version: 1.0.0 | 2026
// ============================================================

// ─── CONFIGURATION ──────────────────────────────────────────
const CONFIG = {
  SHEET_NAME: 'Registry',
  RATE_LIMIT_SHEET: 'RateLimit',
  REG_PREFIX: 'APNSL',
  MAX_SUBMISSIONS_PER_HOUR: 3,
  // ── Email settings ───────────────────────────────────────────
  ADMIN_EMAIL_PLACEHOLDER: 'apnsl.registry@gmail.com', // shown in email footer
  REPLY_TO_EMAIL: 'apnsl.registry@gmail.com',          // replies go here
  ORG_NAME: 'Aviation Professionals Network of Sri Lanka',
  SPREADSHEET_ID_KEY: 'SPREADSHEET_ID',
};

// ─── HELPER: Get Spreadsheet ─────────────────────────────────
// IMPORTANT: getActiveSpreadsheet() does NOT work in a deployed Web App.
// Always use this helper which reads the ID from Script Properties.
function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const ssId  = props.getProperty(CONFIG.SPREADSHEET_ID_KEY);
  if (!ssId) {
    throw new Error(
      'Spreadsheet ID not configured. Please run setupScriptProperties() from the Apps Script editor first.'
    );
  }
  return SpreadsheetApp.openById(ssId);
}

// ─── AIRPORT CATEGORIES REQUIRING BASE AIRPORT ──────────────
const AIRPORT_REQUIRED_CATEGORIES = [
  'Flight Crew',
  'Cabin Crew',
  'Flight Operations & Dispatch',
  'Air Traffic Control (ATC)',
  'Airfield & Navigational Operations',
  'Ground Operations & Ramp Services',
  'Airport Services & Ticketing',
  'Cargo & Logistics',
  'Emergency & Fire Services (ARFF)',
  'General/Specialized Aviation (FBO, Corporate, Air Ambulance)',
];

// ─── VALID OPTIONS ───────────────────────────────────────────
const VALID_JOB_CATEGORIES = [
  'Flight Crew',
  'Cabin Crew',
  'Flight Operations & Dispatch',
  'Air Traffic Control (ATC)',
  'Airfield & Navigational Operations',
  'Aircraft Maintenance & Engineering (MRO)',
  'Aircraft Design & Manufacturing',
  'Ground Operations & Ramp Services',
  'Airport Services & Ticketing',
  'Cargo & Logistics',
  'University Teachers & Academic Researchers',
  'Flight & Ground Instructors',
  'Type Rating Examiners',
  'Aviation Communicators & Media (Content Creators, PR Officers, Journalists)',
  'Aviation Safety & Quality Assurance',
  'Aviation Security (AVSEC)',
  'Emergency & Fire Services (ARFF)',
  'Aviation Medicine & Human Factors',
  'Aviation Business (Leasing, Revenue Management, Strategy)',
  'Aviation Law & Regulatory Affairs',
  'Drone/UAS Operations & Emerging Technologies (eVTOL, UTM)',
  'Aviation Sustainability',
  'General/Specialized Aviation (FBO, Corporate, Air Ambulance)',
];

const VALID_AIRPORTS = [
  'BIA (Bandaranaike International Airport)',
  'MRIA (Mattala Rajapaksa International Airport)',
  'Ratmalana Airport',
  'Jaffna International Airport',
  'Batticaloa Airport',
  'Trincomalee Airport',
  'Ampara Airport',
  'Anuradhapura Airport',
  'Sigiriya Airport',
  'Castlereagh Reservoir Waterdrome',
  'Polgolla Reservoir Waterdrome',
  'Koggala Airport',
  'Hingurakgoda Airport',
  'Vavuniya Airport',
  'Other / Not Applicable',
];

const VALID_EMPLOYMENT_STATUSES = [
  'Full-Time Permanent',
  'Contract',
  'Freelance / On-Call',
];

// ─── SERVE HTML ──────────────────────────────────────────────
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  const output = template.evaluate()
    .setTitle('Registration — Aviation Professionals Network of Sri Lanka')
    .setFaviconUrl('https://www.google.com/favicon.ico')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return output;
}

// ─── HANDLE POST ─────────────────────────────────────────────
function doPost(e) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return buildResponse({ success: false, error: 'Invalid request format.' }, headers);
    }

    // ── Rate limiting ────────────────────────────────────────
    const clientIp = e.parameter && e.parameter.ip ? e.parameter.ip : 'unknown';
    const rateLimitResult = checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return buildResponse({ success: false, error: 'Rate limit exceeded. Please try again in 1 hour.' }, headers);
    }

    // ── Server-side validation ───────────────────────────────
    const validationResult = validatePayload(payload);
    if (!validationResult.valid) {
      return buildResponse({ success: false, error: validationResult.error }, headers);
    }

    // ── Sanitize all inputs ──────────────────────────────────
    const clean = sanitizePayload(payload);

    // ── Get registry sheet ───────────────────────────────
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      sheet = createRegistrySheet(ss);
    }

    const data = sheet.getDataRange().getValues();

    // ── Duplicate: Email check ───────────────────────────────
    for (let i = 1; i < data.length; i++) {
      if (data[i][4] && data[i][4].toString().toLowerCase().trim() === clean.primaryEmail.toLowerCase().trim()) {
        return buildResponse({
          success: false,
          error: 'A registration already exists for this email address. Please contact the administrator.',
        }, headers);
      }
    }

    // ── Duplicate: CAASL License check ──────────────────────
    if (clean.caasLicenseNo && clean.caasLicenseNo.trim() !== '') {
      for (let i = 1; i < data.length; i++) {
        if (data[i][13] && data[i][13].toString().trim().toLowerCase() === clean.caasLicenseNo.trim().toLowerCase()) {
          return buildResponse({
            success: false,
            error: 'A registration already exists for this CAASL License Number.',
          }, headers);
        }
      }
    }

    // ── Generate Registration Number ─────────────────────────
    const regNo = generateRegistrationNumber(sheet);

    // ── Build row ────────────────────────────────────────────
    const timestamp = new Date();
    const row = [
      timestamp,                          // A: Timestamp
      regNo,                              // B: Registration Number
      clean.fullName,                     // C: Full Name
      clean.preferredName,                // D: Preferred Name
      clean.primaryEmail,                 // E: Primary Email
      clean.primaryContactNo,             // F: Primary Contact No.
      clean.secondaryContactNo || '',     // G: Secondary Contact No.
      clean.permanentAddress,             // H: Permanent Address
      clean.currentEmployer,              // I: Current Employer
      clean.jobCategory,                  // J: Job Category
      clean.jobTitle,                     // K: Job Title
      clean.primaryBaseAirport || '',     // L: Primary Base Airport
      clean.employmentStatus,             // M: Employment Status
      clean.caasLicenseNo || '',          // N: CAASL License No.
      clean.licenseType || '',            // O: License Type
      clean.typeRatings || '',            // P: Type Ratings
      clean.totalExperience || '',        // Q: Total Experience / Hours
      'PENDING',                          // R: Email Sent Status
    ];

    sheet.appendRow(row);
    const lastRow = sheet.getLastRow();

    // ── Send confirmation email ──────────────────────────────
    let emailStatus = 'PENDING';
    try {
      sendConfirmationEmail(clean, regNo, timestamp);
      emailStatus = 'SENT';
    } catch (emailErr) {
      emailStatus = 'FAILED';
      console.error('Email send failed for %s: %s', regNo, emailErr.toString());
    }

    // ── Update email status in sheet ─────────────────────────
    sheet.getRange(lastRow, 18).setValue(emailStatus);

    // ── Record rate limit hit ────────────────────────────────
    recordRateLimitHit(clientIp);

    return buildResponse({ success: true, regNo: regNo }, headers);

  } catch (err) {
    console.error('doPost error: ' + err.toString());
    return buildResponse({ success: false, error: 'A server error occurred. Please try again later.' }, headers);
  }
}

// ─── ADMIN DATA ENDPOINT ─────────────────────────────────────
function doGet_admin(e) {
  // Called via query param ?action=adminData&password=xxx
  try {
    const adminPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    const providedPassword = e.parameter && e.parameter.password ? e.parameter.password : '';

    if (!adminPassword || providedPassword !== adminPassword) {
      return buildResponse({ success: false, error: 'Access Denied.' }, {});
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return buildResponse({ success: true, data: [], headers: [] }, {});

    const allData = sheet.getDataRange().getValues();
    const headers = allData[0] || [];
    const rows = allData.slice(1);

    return buildResponse({ success: true, headers: headers, data: rows }, {});
  } catch (err) {
    return buildResponse({ success: false, error: err.toString() }, {});
  }
}

// ─── HELPER: Build JSON Response ─────────────────────────────
function buildResponse(obj, headers) {
  const output = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ─── HELPER: Validate Payload ────────────────────────────────
function validatePayload(p) {
  // Full Name
  if (!p.fullName || !/^[a-zA-Z\s.'\-]{3,100}$/.test(p.fullName.trim())) {
    return { valid: false, error: 'Full Name: Enter your full legal name (3–100 characters).' };
  }

  // Preferred Name
  if (!p.preferredName || !/^[a-zA-Z\s.'\-]{2,50}$/.test(p.preferredName.trim())) {
    return { valid: false, error: 'Preferred Name: Enter your preferred name.' };
  }

  // Primary Email
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!p.primaryEmail || !emailRegex.test(p.primaryEmail.trim())) {
    return { valid: false, error: 'Primary Email: Enter a valid email address.' };
  }

  // Primary Contact No.
  const phoneRegex = /^(07\d{8}|\+947\d{8}|\+94\s?7\d{8})$/;
  if (!p.primaryContactNo || !phoneRegex.test(p.primaryContactNo.trim().replace(/\s/g, ''))) {
    return { valid: false, error: 'Primary Contact No.: Enter a valid Sri Lankan mobile number.' };
  }

  // Secondary Contact No. (optional)
  if (p.secondaryContactNo && p.secondaryContactNo.trim() !== '') {
    if (!phoneRegex.test(p.secondaryContactNo.trim().replace(/\s/g, ''))) {
      return { valid: false, error: 'Secondary Contact No.: Invalid phone number.' };
    }
  }

  // Permanent Address
  if (!p.permanentAddress || p.permanentAddress.trim().length < 10 || p.permanentAddress.trim().length > 500) {
    return { valid: false, error: 'Permanent Address: Enter your full residential address (10–500 characters).' };
  }

  // Current Employer
  if (!p.currentEmployer || p.currentEmployer.trim().length < 2 || p.currentEmployer.trim().length > 100) {
    return { valid: false, error: 'Current Employer: Enter your current employer (2–100 characters).' };
  }

  // Job Category
  if (!p.jobCategory || !VALID_JOB_CATEGORIES.includes(p.jobCategory)) {
    return { valid: false, error: 'Job Category: Select a valid job category.' };
  }

  // Job Title
  if (!p.jobTitle || p.jobTitle.trim().length < 2 || p.jobTitle.trim().length > 100) {
    return { valid: false, error: 'Job Title: Enter your job title (2–100 characters).' };
  }

  // Primary Base Airport (conditional)
  if (AIRPORT_REQUIRED_CATEGORIES.includes(p.jobCategory)) {
    if (!p.primaryBaseAirport || !VALID_AIRPORTS.includes(p.primaryBaseAirport)) {
      return { valid: false, error: 'Primary Base Airport: Select your primary base airport.' };
    }
  } else if (p.primaryBaseAirport && p.primaryBaseAirport.trim() !== '') {
    if (!VALID_AIRPORTS.includes(p.primaryBaseAirport)) {
      return { valid: false, error: 'Primary Base Airport: Invalid airport selection.' };
    }
  }

  // Employment Status
  if (!p.employmentStatus || !VALID_EMPLOYMENT_STATUSES.includes(p.employmentStatus)) {
    return { valid: false, error: 'Employment Status: Select your employment status.' };
  }

  // CAASL License No. (optional)
  const licenseRegex = /^[A-Za-z0-9\/\-\s]{5,50}$/;
  if (p.caasLicenseNo && p.caasLicenseNo.trim() !== '') {
    if (!licenseRegex.test(p.caasLicenseNo.trim())) {
      return { valid: false, error: 'CAASL License No.: Invalid license format.' };
    }
    // License Type required if CAASL No. provided
    if (!p.licenseType || p.licenseType.trim().length < 2) {
      return { valid: false, error: 'License Type: License type is required when CAASL No. is provided.' };
    }
  }

  // Type Ratings
  if (p.typeRatings && p.typeRatings.length > 200) {
    return { valid: false, error: 'Type Ratings: Must not exceed 200 characters.' };
  }

  // Total Experience
  if (p.totalExperience && p.totalExperience.length > 100) {
    return { valid: false, error: 'Total Experience: Must not exceed 100 characters.' };
  }

  return { valid: true };
}

// ─── HELPER: Sanitize Payload ────────────────────────────────
function sanitizePayload(p) {
  const clean = {};
  for (const key in p) {
    if (typeof p[key] === 'string') {
      // Strip HTML tags and dangerous chars
      clean[key] = p[key]
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .trim();
    } else {
      clean[key] = p[key];
    }
  }

  // Normalize phone number to +94 format
  if (clean.primaryContactNo) {
    clean.primaryContactNo = normalizePhone(clean.primaryContactNo);
  }
  if (clean.secondaryContactNo) {
    clean.secondaryContactNo = normalizePhone(clean.secondaryContactNo);
  }

  return clean;
}

// ─── HELPER: Normalize Phone ─────────────────────────────────
function normalizePhone(phone) {
  const stripped = phone.replace(/\s/g, '');
  if (stripped.startsWith('07')) {
    return '+94' + stripped.substring(1);
  }
  if (stripped.startsWith('+94')) {
    return stripped;
  }
  return stripped;
}

// ─── HELPER: Generate Registration Number ───────────────────
function generateRegistrationNumber(sheet) {
  const currentYear = new Date().getFullYear();
  const prefix = CONFIG.REG_PREFIX + '-' + currentYear + '-';

  const lastRow = sheet.getLastRow();
  let maxSeq = 0;

  if (lastRow > 1) {
    const regNumbers = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    regNumbers.forEach(function(row) {
      const regNo = row[0] ? row[0].toString() : '';
      if (regNo.startsWith(prefix)) {
        const seq = parseInt(regNo.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
  }

  const nextSeq = maxSeq + 1;
  const padded = nextSeq.toString().padStart(4, '0');
  return prefix + padded;
}

// ─── HELPER: Rate Limiting ───────────────────────────────────
function checkRateLimit(ip) {
  try {
    const ss = getSpreadsheet();
    let rlSheet = ss.getSheetByName(CONFIG.RATE_LIMIT_SHEET);
    if (!rlSheet) {
      rlSheet = ss.insertSheet(CONFIG.RATE_LIMIT_SHEET);
      rlSheet.appendRow(['IP Address', 'Timestamps']);
    }

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const data = rlSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === ip) {
        let timestamps = [];
        try {
          timestamps = JSON.parse(data[i][1] || '[]');
        } catch (e) {
          timestamps = [];
        }
        // Filter to last hour
        const recent = timestamps.filter(function(ts) { return ts > oneHourAgo; });
        if (recent.length >= CONFIG.MAX_SUBMISSIONS_PER_HOUR) {
          return { allowed: false };
        }
        return { allowed: true };
      }
    }
    return { allowed: true };
  } catch (err) {
    console.error('Rate limit check error: ' + err.toString());
    return { allowed: true }; // Fail open to avoid blocking legitimate users
  }
}

function recordRateLimitHit(ip) {
  try {
    const ss = getSpreadsheet();
    let rlSheet = ss.getSheetByName(CONFIG.RATE_LIMIT_SHEET);
    if (!rlSheet) {
      rlSheet = ss.insertSheet(CONFIG.RATE_LIMIT_SHEET);
      rlSheet.appendRow(['IP Address', 'Timestamps']);
    }

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const data = rlSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === ip) {
        let timestamps = [];
        try {
          timestamps = JSON.parse(data[i][1] || '[]');
        } catch (e) {
          timestamps = [];
        }
        const recent = timestamps.filter(function(ts) { return ts > oneHourAgo; });
        recent.push(now);
        rlSheet.getRange(i + 1, 2).setValue(JSON.stringify(recent));
        return;
      }
    }

    rlSheet.appendRow([ip, JSON.stringify([now])]);
  } catch (err) {
    console.error('Rate limit record error: ' + err.toString());
  }
}

// ─── HELPER: Create Registry Sheet with Headers ──────────────
function createRegistrySheet(ss) {
  const sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  const headers = [
    'Timestamp',
    'Registration Number',
    'Full Name',
    'Preferred Name',
    'Primary Email',
    'Primary Contact No.',
    'Secondary Contact No.',
    'Permanent Address',
    'Current Employer',
    'Job Category',
    'Job Title',
    'Primary Base Airport',
    'Employment Status',
    'CAASL License No.',
    'License Type',
    'Type Ratings',
    'Total Experience / Hours',
    'Email Sent Status',
  ];
  sheet.appendRow(headers);

  // Style the header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#0f172a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  return sheet;
}

// ─── HELPER: Send Confirmation Email ────────────────────────
function sendConfirmationEmail(data, regNo, timestamp) {
  const emailTemplate = HtmlService.createTemplateFromFile('EmailTemplate');
  emailTemplate.data = data;
  emailTemplate.regNo = regNo;
  emailTemplate.timestamp = timestamp;
  emailTemplate.adminEmail = CONFIG.ADMIN_EMAIL_PLACEHOLDER;
  emailTemplate.orgName = CONFIG.ORG_NAME;

  const htmlBody = emailTemplate.evaluate().getContent();

  // Clean subject: no symbols, no ALL CAPS words — reduces spam score
  const subject = 'Your APNSL Registration is Confirmed [' + regNo + ']';

  // Plain-text fallback: mail clients and spam filters prefer emails with both
  const textBody = [
    'Dear ' + data.fullName.trim().split(' ')[0] + ',',
    '',
    'Thank you for registering with the Aviation Professionals Network of Sri Lanka.',
    'Your registration has been confirmed.',
    '',
    'REGISTRATION NUMBER: ' + regNo,
    '',
    'Please retain this number for all future correspondence.',
    '',
    'Kind regards,',
    'Aviation Professionals Network of Sri Lanka',
    CONFIG.ADMIN_EMAIL_PLACEHOLDER,
  ].join('\n');

  // NOTE: GAS always sends FROM the script owner's Gmail account.
  // 'replyTo' ensures any reply from the registrant lands in the org inbox.
  MailApp.sendEmail({
    to: data.primaryEmail,
    subject: subject,
    body: textBody,                   // plain-text version (critical for spam)
    htmlBody: htmlBody,               // HTML version shown to modern clients
    name: CONFIG.ORG_NAME,
    replyTo: CONFIG.REPLY_TO_EMAIL,
    noReply: false,
  });
}

// ─── UTILITY: Include HTML files ────────────────────────────
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── SETUP: Initialize script properties ─────────────────────
// !! RUN THIS ONCE MANUALLY from the Apps Script editor before deploying !!
// It creates the Google Sheet, saves its ID, and sets the admin password.
function setupScriptProperties() {
  const props = PropertiesService.getScriptProperties();

  // 1. Create (or reuse) the Google Spreadsheet
  let ssId = props.getProperty(CONFIG.SPREADSHEET_ID_KEY);
  if (!ssId) {
    const ss = SpreadsheetApp.create('Aviation Professionals Network — Registry');
    ssId = ss.getId();
    props.setProperty(CONFIG.SPREADSHEET_ID_KEY, ssId);
    console.log('Created new spreadsheet: ' + ss.getUrl());
  } else {
    console.log('Using existing spreadsheet ID: ' + ssId);
  }

  // 2. Ensure Registry sheet exists with correct headers
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    createRegistrySheet(ss);
    console.log('Created Registry sheet.');
  }

  // 3. Set admin password
  props.setProperty('ADMIN_PASSWORD', 'AviationAdmin@2026'); // Change before going live!

  const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + ssId;
  console.log('✅ Setup complete.');
  console.log('📊 Spreadsheet URL: ' + sheetUrl);
  console.log('👉 ACTION REQUIRED: Open the URL above and share/move the sheet:');
  console.log('   • Click Share → add your admin team emails with Editor access');
  console.log('   • Or move it to a shared Google Drive folder');
  console.log('📧 Emails will be sent FROM: ' + Session.getActiveUser().getEmail());
  console.log('   Replies will go TO: ' + CONFIG.REPLY_TO_EMAIL + ' (set REPLY_TO_EMAIL in CONFIG)');
}

// ─── CALLABLE: Form Submission (from google.script.run) ───────
/**
 * Called from frontend via google.script.run.processFormSubmission(payload).
 * Runs full server-side validation, duplicate checks, appends row, sends email.
 * Returns { success: true, regNo } or { success: false, error }.
 */
function processFormSubmission(payload) {
  try {
    // Rate limiting (GAS does not expose real IPs; use Session email as fingerprint
    // for authenticated users, or fall back to 'anonymous')
    const clientIp = Session.getActiveUser().getEmail() || 'anonymous';
    const rateLimitResult = checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return { success: false, error: 'Rate limit exceeded. Please try again in 1 hour.' };
    }

    // Server-side validation
    const validationResult = validatePayload(payload);
    if (!validationResult.valid) {
      return { success: false, error: validationResult.error };
    }

    // Sanitize
    const clean = sanitizePayload(payload);

    // Get / create registry sheet
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) sheet = createRegistrySheet(ss);

    const data = sheet.getDataRange().getValues();

    // Duplicate: email
    for (let i = 1; i < data.length; i++) {
      if (data[i][4] && data[i][4].toString().toLowerCase().trim() === clean.primaryEmail.toLowerCase().trim()) {
        return { success: false, error: 'A registration already exists for this email address. Please contact the administrator.' };
      }
    }

    // Duplicate: CAASL License
    if (clean.caasLicenseNo && clean.caasLicenseNo.trim() !== '') {
      for (let i = 1; i < data.length; i++) {
        if (data[i][13] && data[i][13].toString().trim().toLowerCase() === clean.caasLicenseNo.trim().toLowerCase()) {
          return { success: false, error: 'A registration already exists for this CAASL License Number.' };
        }
      }
    }

    // Generate registration number
    const regNo = generateRegistrationNumber(sheet);
    const timestamp = new Date();

    const row = [
      timestamp,
      regNo,
      clean.fullName,
      clean.preferredName,
      clean.primaryEmail,
      clean.primaryContactNo,
      clean.secondaryContactNo || '',
      clean.permanentAddress,
      clean.currentEmployer,
      clean.jobCategory,
      clean.jobTitle,
      clean.primaryBaseAirport || '',
      clean.employmentStatus,
      clean.caasLicenseNo || '',
      clean.licenseType || '',
      clean.typeRatings || '',
      clean.totalExperience || '',
      'PENDING',
    ];

    sheet.appendRow(row);
    const lastRow = sheet.getLastRow();

    // Send email
    let emailStatus = 'PENDING';
    try {
      sendConfirmationEmail(clean, regNo, timestamp);
      emailStatus = 'SENT';
    } catch (emailErr) {
      emailStatus = 'FAILED';
      console.error('Email send failed for %s: %s', regNo, emailErr.toString());
    }
    sheet.getRange(lastRow, 18).setValue(emailStatus);

    // Record rate limit hit
    recordRateLimitHit(clientIp);

    return { success: true, regNo: regNo };

  } catch (err) {
    console.error('processFormSubmission error: ' + err.toString());
    return { success: false, error: 'A server error occurred. Please try again later.' };
  }
}

// ─── CALLABLE: Verify Admin Password ─────────────────────────
/**
 * Called from frontend via google.script.run.verifyAdminPassword(password).
 * Returns { success: true } or { success: false, error }.
 */
function verifyAdminPassword(providedPassword) {
  try {
    const adminPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    if (!adminPassword) {
      return { success: false, error: 'Admin password not configured. Run setupScriptProperties() first.' };
    }
    if (providedPassword === adminPassword) {
      return { success: true };
    }
    return { success: false, error: 'Access Denied. Incorrect password.' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ─── CALLABLE: Get Admin Data ─────────────────────────────────
/**
 * Called from frontend via google.script.run.getAdminData(password).
 * Returns { success: true, headers, data } or { success: false, error }.
 */
function getAdminData(providedPassword) {
  try {
    const adminPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
    if (!adminPassword || providedPassword !== adminPassword) {
      return { success: false, error: 'Access Denied.' };
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      return { success: true, headers: [], data: [] };
    }

    const allData = sheet.getDataRange().getValues();
    const headers = allData[0] || [];
    const rows    = allData.slice(1);

    return { success: true, headers: headers, data: rows };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ─── UNIT TEST: processFormSubmission ────────────────────────
// Run this from the Apps Script editor to verify the full submission flow.
function testProcessFormSubmission() {
  const testPayload = {
    fullName:           'Test Aviation User',
    preferredName:      'Test User',
    primaryEmail:       'testuser_' + Date.now() + '@test.lk',
    primaryContactNo:   '0771234567',
    secondaryContactNo: '',
    permanentAddress:   '123 Test Road, Colombo 01, Sri Lanka',
    currentEmployer:    'Test Airlines',
    jobCategory:        'Flight Crew',
    jobTitle:           'First Officer',
    primaryBaseAirport: 'BIA (Bandaranaike International Airport)',
    employmentStatus:   'Full-Time Permanent',
    caasLicenseNo:      '',
    licenseType:        '',
    typeRatings:        'Airbus A320',
    totalExperience:    '500 Flight Hours',
  };

  console.log('Running unit test...');
  const result = processFormSubmission(testPayload);
  console.log('Result: ' + JSON.stringify(result));

  if (result.success) {
    console.log('✅ TEST PASSED — Registration number: ' + result.regNo);
  } else {
    console.log('❌ TEST FAILED — Error: ' + result.error);
  }
  return result;
}

