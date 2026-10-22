/**
 * Pdf.gs: the signed PDFs and where they are kept.
 *
 * Folder layout inside the Shared Drive folder from Settings:
 *
 *   Chromebook Agreements [School Year]/
 *     Grade [N]/
 *       LastName_FirstName_StudentID/        one folder per student
 *         LastName_FirstName_Gr[N]_ChromebookAgreement.pdf     signed by the family; never changed afterwards
 *         LastName_FirstName_Gr[N]_DigitalPromise.pdf
 *         LastName_FirstName_Gr[N]_VerizonRelease.pdf
 *         LastName_FirstName_Gr[N]_CheckoutRecord_[AssetTag].pdf   made by the app when a Chromebook is assigned
 *         _signatures/                        the drawn signature images
 *         _previous/                          older copies, never deleted
 *
 * Each PDF is the school's own blank form with the blanks filled in
 * (PdfFill.gs). If a blank form is not set in Settings, or filling fails, a
 * plain version is produced instead so a signed record is never lost.
 */

function subFolder_(parent, name) {
  return withLock_(function () {
    var it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  });
}

/** "Chromebook Agreements [School Year]" inside the configured Shared Drive folder. */
function yearFolder_(cfg) {
  if (!cfg.DRIVE_FOLDER_ID) throw new Error('DRIVE_FOLDER_ID is not set in Config.');
  return subFolder_(DriveApp.getFolderById(cfg.DRIVE_FOLDER_ID), 'Chromebook Agreements ' + cfg.SCHOOL_YEAR);
}

function gradeFolder_(cfg, grade) {
  return subFolder_(yearFolder_(cfg), 'Grade ' + String(grade).replace(/[^0-9A-Za-z]/g, ''));
}

/** The student's own folder. Its ID is remembered on the student row. */
function studentFolder_(cfg, s) {
  if (s.student_folder_id) {
    try { return DriveApp.getFolderById(s.student_folder_id); } catch (e) { /* deleted or moved: make a new one */ }
  }
  var name = pdfFileName_(s.last_name, s.first_name, '', '').replace(/_Gr.*$/, '') + '_' + s.student_id;
  var folder = subFolder_(gradeFolder_(cfg, s.grade), name);
  update_('Students', 'student_id', s.student_id, { student_folder_id: folder.getId() });
  s.student_folder_id = folder.getId();
  return folder;
}

function fileBase_(s) {
  return pdfFileName_(s.last_name, s.first_name, s.grade, '').replace(/_PENDING\.pdf$/, '');
}

function dataUri_(fileId) {
  var blob = DriveApp.getFileById(fileId).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function fileBytes_(fileId) {
  return DriveApp.getFileById(fileId).getBlob().getBytes();
}

/* ---------------- Plain fallback layouts (HTML turned into PDF by Google) ---------------- */

/** Chromebook Checkout as HTML. Used only when the blank PDF form cannot be filled. */
function buildAgreementHtml_(d) {
  var td = 'border:1px solid #000;padding:4px 8px;font-size:11px;';
  var th = td + 'font-weight:bold;text-align:left;';
  var models = d.models.length ? d.models : [''];
  var costRows = d.costs.map(function (c) {
    return '<tr><td style="' + td + '">' + esc_(c.name) + '</td>' + models.map(function (m, i) {
      return '<td style="' + td + 'text-align:right">' + esc_(c.costs[i] === undefined || c.costs[i] === '' ? '' : money_(c.costs[i])) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  var shareRows = d.shares.map(function (s) {
    return '<tr><td style="' + td + '">' + esc_(s.name) + '</td><td style="' + td + '">' + esc_(s.school) +
      '%</td><td style="' + td + '">' + esc_(s.student) + '%</td></tr>';
  }).join('');
  function field(label, value, width) {
    return '<td style="padding:6px 6px 2px 0;font-size:11px;width:' + width + '">' + esc_(label) + ' ' +
      '<span style="border-bottom:1px solid #000;padding:0 6px">' + (esc_(value) || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;') + '</span></td>';
  }
  function sigRow(label, img) {
    return '<tr><td style="font-size:11px;padding-top:6px;width:24%">' + esc_(label) + '</td><td style="border-bottom:1px solid #000;height:30px;width:46%">' +
      (img ? '<img src="' + img + '" style="height:28px;max-width:240px">' : '') + '</td><td style="font-size:11px;padding-left:10px">Date ' + esc_(d.signedDate) + '</td></tr>';
  }
  return '<html><head><meta charset="utf-8"><style>@page{size:letter;margin:0.6in}' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:11px;line-height:1.35}</style></head><body>' +
    '<table style="width:100%;border-collapse:collapse"><tr><td style="font-size:18px;font-weight:bold">' + esc_(d.school) + '</td>' +
    '<td style="text-align:right;font-family:Times,serif;font-size:12px">' + esc_(d.address).replace(/, /, '<br>') + '<br>' + esc_(d.phones) + '</td></tr></table>' +
    '<p style="margin:10px 0 0;font-size:14px;text-align:center">Chromebook Checkout Informational Form ' + esc_(d.schoolYear) + '</p>' +
    '<p style="margin:10px 0 0"><u>Chromebook Checkout</u><br>A student that chooses to check out a Chromebook will be responsible for the total value of the Chromebook or repairs. ' +
    'According to the following estimates, replacement or repair fees will be assessed for lost or damaged Chromebooks. ' +
    'The school will share costs based on the number of incidents the student has had with regards to Chromebook damages unless purposely damaged with evidence to support. ' +
    'If it is determined the damage was intentional then the student will be responsible for all costs associated with repair.</p>' +
    '<p style="margin:8px 0 0;font-weight:bold">Repair and Replacement Charges for Chromebooks</p>' +
    '<table style="border-collapse:collapse;width:100%;margin:8px 0"><tr><th style="' + th + '">Component</th>' +
    models.map(function (m) { return '<th style="' + th + 'text-align:right">' + esc_(m) + '</th>'; }).join('') + '</tr>' + costRows + '</table>' +
    '<p style="margin:0 0 6px">The school will share costs for repairs based on the number of times the device is to be repaired.</p>' +
    '<table style="border-collapse:collapse;width:100%;margin:0 0 8px"><tr><td style="' + td + '"></td><td style="' + td + '">School Share</td><td style="' + td +
    '">Student Share</td></tr>' + shareRows + '</table>' +
    '<table style="width:100%;border-collapse:collapse"><tr>' + field("Student's Name", d.studentName, '75%') + field('Grade', d.grade, '25%') + '</tr></table>' +
    '<table style="width:100%;border-collapse:collapse"><tr>' + field('Parent/Guardian Name', d.parentName, '100%') + '</tr></table>' +
    '<p style="margin:8px 0;font-size:10px"><b>By signing below, you agree to follow this statement:</b> I understand that I will be responsible for any damages to the ASE-issued Chromebook and will need to pay for these repairs promptly. ' +
    'The student will not be allowed to take home a Chromebook until repairs are paid in full. ' +
    'Any debts owed to Albuquerque School of Excellence will hold registration and records until paid in full. ' +
    'I also understand I will be responsible for the usage of the Chromebook while the student is off-campus. ' +
    'I understand that if my Chromebook is Lost/Stolen, the Albuquerque School of Excellence will NOT be held responsible.</p>' +
    '<table style="width:100%;border-collapse:collapse">' + sigRow('Student Signature', d.studentSig) + sigRow('Parent/Guardian Signature', d.parentSig) + '</table>' +
    '<p style="margin:16px 0 4px">For more information on our Chromebook Program, Technical Support, repairs or replacement ' +
    'please contact our Information Technology Department at ' + esc_(d.itEmail) + '.</p>' +
    '<p style="margin:0;font-size:8px;color:#444">' + esc_(d.audit) + '</p></body></html>';
}

/** A partner form as HTML: its full text, then what was filled in. Fallback only. withChecklist: the Digital Promise form. */
function buildFormHtml_(text, d, withChecklist) {
  var body = text.blocks.map(function (b) {
    if (b.h) return '<p style="margin:8px 0 0;font-weight:bold;text-decoration:underline">' + esc_(b.h) + '</p>';
    return '<p style="margin:0 0 6px;' + (b.strong ? 'font-weight:bold' : '') + '">' + esc_(b.p.replace('{{end_user}}', d.studentName)) + '</p>';
  }).join('');
  var checklist = '';
  if (withChecklist) {
    checklist = '<p style="margin-top:12px">Participant Name: <b>' + esc_(d.studentName) + '</b></p><p style="font-weight:bold">' + esc_(text.checklistIntro) + '</p>' +
      '<table style="border-collapse:collapse;width:100%">' + text.checklist.map(function (line) {
        return '<tr><td style="border:1px solid #000;padding:3px 6px;font-size:10px">' + esc_(line) + '</td><td style="border:1px solid #000;padding:3px 6px;width:16%;font-size:10px">P/G ' +
          esc_(d.parentInitials) + '<br>S ' + esc_(d.studentInitials) + '</td></tr>';
      }).join('') + '</table><p>' + esc_(text.checklistClosing) + '</p>';
  } else {
    checklist = '<p style="margin-top:12px">Printed Name of Parent or Guardian: <b>' + esc_(d.parentName) + '</b><br>Printed Name of Student: <b>' + esc_(d.studentName) +
      '</b><br>Date: ' + esc_(d.signedDate) + '</p><p>' + esc_(text.choiceLabel) + ' <b>' + esc_(text.choices[d.vzConsent] || '') + '</b></p>';
  }
  function sig(label, img, name) {
    return '<td style="width:50%;vertical-align:bottom;padding-right:12px"><div style="height:34px;border-bottom:1px solid #000">' +
      (img ? '<img src="' + img + '" style="height:32px;max-width:240px">' : '') + '</div><div style="font-size:10px">' + esc_(label) + ': ' + esc_(name) + ', ' + esc_(d.signedDate) + '</div></td>';
  }
  return '<html><head><meta charset="utf-8"><style>@page{size:letter;margin:0.8in}body{font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3}</style></head><body>' +
    '<p style="text-align:center;font-weight:bold">' + (text.subtitle ? esc_(text.subtitle) + '<br>' : '') + esc_(text.title) + '</p>' + body + checklist +
    '<table style="width:100%;border-collapse:collapse;margin-top:10px"><tr>' + sig('Student Signature', d.studentSigUri, d.studentName) +
    sig('Parent Signature', d.parentSigUri, d.parentName) + '</tr></table>' +
    '<p style="font-size:8px;color:#444">' + esc_(d.audit) + '</p></body></html>';
}

/* ---------------- Building and saving ---------------- */

/** Everything the three documents need for one student. */
function pdfData_(s, cfg) {
  if (!s.signed_date || !s.agreement_id) throw new Error('This student has no signed agreement yet.');
  var sigs = filter_('Signatures', 'record_id', s.agreement_id);
  var parent = sigs.filter(function (x) { return x.signer_type === 'parent'; })[0];
  var student = sigs.filter(function (x) { return x.signer_type === 'student'; })[0];
  if (!parent || !student) throw new Error('Signature records are missing for ' + s.agreement_id + '.');
  var checkout = filter_('Checkouts', 'student_id', s.student_id).filter(function (c) {
    return c.type === 'Assigned' && !c.returned_date && c.asset_tag === s.asset_tag;
  }).pop();
  var staffBy = '';
  if (checkout) {
    var st = find_('Staff', 'email', checkout.staff_email);
    staffBy = st && st.name ? st.name : checkout.staff_email;
  }
  var studentName = s.first_name + ' ' + s.last_name;
  return {
    school: cfg.SCHOOL_NAME, address: cfg.SCHOOL_ADDRESS, phones: cfg.SCHOOL_PHONES, itEmail: cfg.IT_EMAIL,
    models: cfg._models, costs: cfg._costs, shares: cfg._shares,
    schoolYear: cfg.SCHOOL_YEAR, vzConsent: s.vz_consent === VZ_TEXT_.choices.decline ? 'decline' : s.vz_consent === VZ_TEXT_.choices.agree ? 'agree' : '',
    studentName: studentName, grade: s.grade, parentName: s.signer_name, phone: s.signer_phone, email: s.signer_email,
    signedDate: usDate_(s.signed_date),
    parentSigId: parent.signature_file_id, studentSigId: student.signature_file_id,
    checkout: checkout || null, staffBy: staffBy, campus: cfg.CAMPUS,
    parentInitials: s.pg_initials, studentInitials: s.s_initials,
    audit: 'Signed electronically on ' + s.signed_date + ' (' + Session.getScriptTimeZone() + ') by ' + s.signer_name + ' and ' + studentName +
      ' (grade ' + s.grade + ', student ID ' + s.student_id + ') via ASE Chromebook App. Record ID: ' + s.agreement_id + '.'
  };
}

/**
 * Fills the blank form named by a Settings key. Returns a PDF blob, or null if
 * no blank form is set or filling failed (the caller then uses the plain layout).
 */
async function fillBlankForm_(cfg, key, fillFn, data, name, studentId, userEmail) {
  var problem = '';
  if (!cfg[key]) problem = 'no blank form is set in Settings';
  else {
    try {
      var bytes = await fillFn(fileBytes_(cfg[key]), data);
      return Utilities.newBlob(toSignedBytes_(bytes), 'application/pdf', name);
    } catch (e) { problem = e.message; }
  }
  log_(studentId, 'Blank form could not be filled, plain layout used', key + ': ' + problem, userEmail);
  // Tell IT, but at most once an hour per form, not once per family.
  if (rateLimit_('formfail:' + key, 1, 3600)) {
    notifyIt_('A signed form was saved in the plain layout', 'The blank PDF for ' + key + ' could not be used: ' + problem +
      '.\n\nThe signed record is safe and a plain copy was saved. Fix the setting, run the PDF test under Settings, Technical, then open the affected students and choose "Make the PDFs again".');
  }
  return null;
}

function formsReady_(cfg) {
  return cfg.SIGN_FORMS_ONLINE !== 'Y' ? !!cfg.CHECKOUT_TEMPLATE_FILE_ID
    : !!(cfg.CHECKOUT_TEMPLATE_FILE_ID && cfg.DP_TEMPLATE_FILE_ID && cfg.VZ_TEMPLATE_FILE_ID);
}

function htmlPdf_(html, name) {
  return Utilities.newBlob(html, 'text/html', 'form.html').getAs('application/pdf').setName(name);
}

/** Saves a PDF in the student's folder, moving the copy it replaces to "_previous". */
function savePdf_(s, folder, blob, idField, userEmail) {
  if (s[idField]) {
    try {
      var old = DriveApp.getFileById(s[idField]);
      old.setName(old.getName().replace(/\.pdf$/i, '') + '_replaced_' + now_().replace(/[^0-9]/g, '') + '.pdf');
      old.moveTo(subFolder_(folder, '_previous'));
    } catch (e) {
      log_(s.student_id, 'Could not archive previous PDF', e.message, userEmail);
    }
  }
  var file = folder.createFile(blob);
  var patch = {};
  patch[idField] = file.getId();
  if (idField === 'pdf_file_id') patch.pdf_link = file.getUrl();
  update_('Students', 'student_id', s.student_id, patch);
  log_(s.student_id, 'PDF created', blob.getName(), userEmail);
  return file;
}

/**
 * Creates (or re-creates) the family's Chromebook Checkout agreement PDF.
 * It holds only what the family read and signed, so it is the same document
 * before and after deployment day. Returns the Drive file.
 */
async function generatePdf_(studentId, userEmail) {
  var cfg = getConfig_();
  var s = getStudent_(studentId);
  var d = pdfData_(s, cfg);
  var name = fileBase_(s) + '_ChromebookAgreement.pdf';
  d.parentSig = fileBytes_(d.parentSigId);
  d.studentSig = fileBytes_(d.studentSigId);
  var blob = await fillBlankForm_(cfg, 'CHECKOUT_TEMPLATE_FILE_ID', fillCheckoutPdf_, d, name, s.student_id, userEmail);
  if (!blob) {
    d.parentSig = dataUri_(d.parentSigId);
    d.studentSig = dataUri_(d.studentSigId);
    blob = htmlPdf_(buildAgreementHtml_(d), name);
  }
  return savePdf_(s, studentFolder_(cfg, s), blob, 'pdf_file_id', userEmail);
}

/**
 * Creates the check-out record for the Chromebook the student holds now:
 * student, asset tag, serial number, who handed it over and when. Made
 * automatically when a device is assigned. Returns the Drive file, or null if
 * the student has no Chromebook.
 */
async function generateCheckoutRecord_(studentId, userEmail) {
  var cfg = getConfig_();
  var s = getStudent_(studentId);
  var d = pdfData_(s, cfg);
  if (!d.checkout) return null;
  var device = find_('Devices', 'asset_tag', s.asset_tag) || {};
  d.rows = [
    ['Student', d.studentName], ['Grade', s.grade], ['Student ID', s.student_id],
    ['Asset tag', s.asset_tag], ['Serial number', device.serial_number || ''], ['Model', device.model || ''],
    ['Checked out by', d.staffBy], ['Date and time', d.checkout.checked_out_at],
    ['Agreement signed', s.signed_date + ' by ' + s.signer_name], ['Agreement record', s.agreement_id]
  ];
  d.note = 'This Chromebook was issued to the student named above under the Chromebook Checkout agreement signed by the parent or guardian. ' +
    'The signed agreement is kept in the same folder as this record.';
  d.audit = 'Created by ASE Chromebook App on ' + now_() + ' (' + Session.getScriptTimeZone() + '). Check-out ' + d.checkout.checkout_id + '.';
  var name = fileBase_(s) + '_CheckoutRecord_' + pdfFileName_('', '', '', s.asset_tag).replace(/^X_X_GrX_|\.pdf$/g, '') + '.pdf';
  var blob;
  try {
    blob = Utilities.newBlob(toSignedBytes_(await buildCheckoutRecordPdf_(d)), 'application/pdf', name);
  } catch (e) {
    log_(s.student_id, 'Check-out record made in the plain layout', e.message, userEmail);
    blob = htmlPdf_('<html><body style="font-family:Arial,sans-serif;font-size:12px"><h2>' + esc_(d.school) + '</h2><h3>Chromebook Check-out Record</h3><table style="border-collapse:collapse">' +
      d.rows.map(function (row) { return '<tr><td style="border:1px solid #000;padding:4px 8px"><b>' + esc_(row[0]) + '</b></td><td style="border:1px solid #000;padding:4px 8px">' + esc_(row[1]) + '</td></tr>'; }).join('') +
      '</table><p>' + esc_(d.note) + '</p><p style="font-size:8px">' + esc_(d.audit) + '</p></body></html>', name);
  }
  return savePdf_(s, studentFolder_(cfg, s), blob, 'checkout_pdf_file_id', userEmail);
}

/** Creates (or re-creates) the Digital Promise and Verizon PDFs. Returns the Drive files. */
async function generateFormPdfs_(studentId, userEmail) {
  var cfg = getConfig_();
  var s = getStudent_(studentId);
  if (!s.pg_initials) return [];   // the partner forms were not signed online for this student
  var d = pdfData_(s, cfg);
  d.parentSig = fileBytes_(d.parentSigId);
  d.studentSig = fileBytes_(d.studentSigId);
  d.parentSigUri = dataUri_(d.parentSigId);
  d.studentSigUri = dataUri_(d.studentSigId);
  var folder = studentFolder_(cfg, s), base = fileBase_(s), files = [];

  var dpName = base + '_DigitalPromise.pdf';
  var dp = await fillBlankForm_(cfg, 'DP_TEMPLATE_FILE_ID', fillDigitalPromisePdf_, d, dpName, s.student_id, userEmail);
  files.push(savePdf_(s, folder, dp || htmlPdf_(buildFormHtml_(DP_TEXT_, d, true), dpName), 'dp_pdf_file_id', userEmail));

  s = getStudent_(studentId);
  var vzName = base + '_VerizonRelease.pdf';
  var vz = await fillBlankForm_(cfg, 'VZ_TEMPLATE_FILE_ID', fillVerizonPdf_, d, vzName, s.student_id, userEmail);
  files.push(savePdf_(s, folder, vz || htmlPdf_(buildFormHtml_(VZ_TEXT_, d, false), vzName), 'vz_pdf_file_id', userEmail));
  return files;
}

/**
 * Opens a signed PDF through the app (the Drive folder itself stays Admin-only).
 * which: 'checkout' (the signed agreement, default), 'dp', 'vz' or 'record' (the check-out record).
 */
function apiGetPdf(studentId, which) {
  requireRole_(ROLES_IT);
  var s = getStudent_(studentId);
  var field = { dp: 'dp_pdf_file_id', vz: 'vz_pdf_file_id', record: 'checkout_pdf_file_id' }[which] || 'pdf_file_id';
  if (!s[field]) throw new Error('That PDF is not on file for this student yet.');
  var blob = DriveApp.getFileById(s[field]).getBlob();
  log_(s.student_id, 'PDF viewed', blob.getName());
  return { name: blob.getName(), mime: 'application/pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}

async function apiRegeneratePdf(studentId) {
  requireRole_(ROLES_IT);
  var id = clean_(studentId, 30);
  var file = await generatePdf_(id);
  await generateFormPdfs_(id);
  await generateCheckoutRecord_(id);
  return { name: file.getName() };
}

/**
 * Run this once from the script editor after installing. It fills the three
 * blank forms with made-up data and saves them in a "_pdf_test" folder, so you
 * can see that the PDF library works in your Google account before any family signs.
 */
async function pdfSmokeTest() {
  requireRole_(ROLES_ADMIN);
  var cfg = getConfig_();
  // A tiny squiggle stands in for the signatures.
  var png = Utilities.base64Decode('iVBORw0KGgoAAAANSUhEUgAAACgAAAAKCAYAAADGmhxQAAAARklEQVR4nGNgGAUDALhEbP7D8GAyiwGbQeQaTk2z4JopkaeVWSRpIEYdVaKSEgPxqafIcdg0k2sgNc3CMIRauYqaZg1qAACwbjCF6eCmUAAAAABJRU5ErkJggg==');
  var d = {
    models: cfg._models, costs: cfg._costs, shares: cfg._shares, studentName: 'Test Student', grade: '7',
    parentName: 'Test Parent', phone: '505-555-0100', email: 'test@example.com', vzConsent: 'agree',
    signedDate: usDate_(today_()), parentSig: png, studentSig: png, parentInitials: 'TP', studentInitials: 'TS',
    audit: 'TEST ONLY, not a signed document. ' + now_()
  };
  var folder = subFolder_(yearFolder_(cfg), '_pdf_test');
  var report = [];
  var jobs = [['CHECKOUT_TEMPLATE_FILE_ID', fillCheckoutPdf_, 'TEST_Chromebook_Checkout.pdf'],
    ['DP_TEMPLATE_FILE_ID', fillDigitalPromisePdf_, 'TEST_Digital_Promise.pdf'], ['VZ_TEMPLATE_FILE_ID', fillVerizonPdf_, 'TEST_Verizon_Release.pdf']];
  for (var i = 0; i < jobs.length; i++) {
    var key = jobs[i][0];
    if (!cfg[key]) { report.push(key + ': not set in Settings'); continue; }
    try {
      var bytes = await jobs[i][1](fileBytes_(cfg[key]), d);
      var file = folder.createFile(Utilities.newBlob(toSignedBytes_(bytes), 'application/pdf', jobs[i][2]));
      report.push(key + ': OK, saved ' + file.getName());
    } catch (e) {
      report.push(key + ': FAILED, ' + e.message);
    }
  }
  var msg = 'PDF test finished. Open the folder "' + folder.getName() + '" in Drive and look at each file.\n' + report.join('\n');
  console.log(msg);
  return msg;
}
