/**
 * Signing.gs — the parent/student signing flow (no login; access is by the
 * random code in the personal link).
 */

function validCode_(code) {
  code = String(code || '');
  if (!/^[A-Za-z0-9]{8,40}$/.test(code)) throw new Error('INVALID_LINK');
  return code;
}

function findStudentByCode_(code) {
  return find_('Students', 'code', code);
}

function usDate_(ts) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ts || ''));
  return m ? m[2] + '/' + m[3] + '/' + m[1] : '';
}

/** Loads the signing page for a code. Marks the link as opened the first time. */
function apiParentLoad(code) {
  try { code = validCode_(code); } catch (e) { return { state: 'invalid' }; }
  var s = findStudentByCode_(code);
  if (!s) return { state: 'invalid' };
  if (s.link_active !== 'Y') {
    return s.signed_date ? { state: 'signed', date: usDate_(s.signed_date), lang: s.language, canDownload: canParentDownload_(s) } : { state: 'invalid' };
  }
  if (!s.link_opened_date) {
    update_('Students', 'student_id', s.student_id, { link_opened_date: now_() });
    setStage_(s.student_id, 'Link opened', '', false, 'parent link');
  }
  var cfg = getConfig_();
  return {
    state: 'open', lang: s.language === 'es' ? 'es' : 'en',
    student: { first: s.first_name, last: s.last_name, grade: s.grade },
    today: usDate_(today_()), model: cfg._models.join(', '), models: cfg._models,
    costs: cfg._costs, shares: cfg._shares, policyUrl: cfg.POLICY_URL,
    online: cfg.SIGN_FORMS_ONLINE === 'Y', dpText: cfg.SIGN_FORMS_ONLINE === 'Y' ? DP_TEXT_ : null,
    vzText: cfg.SIGN_FORMS_ONLINE === 'Y' ? VZ_TEXT_ : null,
    method: cfg.OUTSIDE_FORMS_METHOD === 'upload' ? 'upload' : 'staff',
    dpUrl: cfg.DP_FORM_URL, vzUrl: cfg.VZ_FORM_URL,
    dpDone: s.dp_status !== 'Not started' && s.dp_status !== '',
    vzDone: s.vz_status !== 'Not started' && s.vz_status !== ''
  };
}

/** How long after signing the family can still download their signed forms from the link. */
var PARENT_DOWNLOAD_MINUTES_ = 60;

function canParentDownload_(s) {
  if (!s.signed_date || !s.pdf_file_id) return false;
  var cutoff = Utilities.formatDate(new Date(new Date().getTime() - PARENT_DOWNLOAD_MINUTES_ * 60000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return s.signed_date >= cutoff;
}

/** The signed PDFs of one student as [{kind, name, base64}], exactly as saved in Drive. */
function signedFiles_(s) {
  var out = [];
  [['checkout', 'pdf_file_id'], ['dp', 'dp_pdf_file_id'], ['vz', 'vz_pdf_file_id']].forEach(function (f) {
    if (!s[f[1]]) return;
    try {
      var blob = DriveApp.getFileById(s[f[1]]).getBlob();
      out.push({ kind: f[0], name: blob.getName(), base64: Utilities.base64Encode(blob.getBytes()) });
    } catch (e) { /* a missing file is simply not offered */ }
  });
  return out;
}

/**
 * Lets the family download their signed forms again from the personal link,
 * for one hour after signing (for example if the page was closed too early).
 * After that the link only says "already signed"; the emailed copies remain.
 */
function apiParentDocs(code) {
  code = validCode_(code);
  if (!rateLimit_('docs:' + code, 10, 3600)) throw new Error('Too many downloads. Please use the copies in your email.');
  var s = findStudentByCode_(code);
  if (!s || s.link_active === 'Y' || !canParentDownload_(s)) throw new Error('The download time has ended. Please use the copies in your email, or contact the school.');
  log_(s.student_id, 'Signed forms downloaded by the family', '', 'parent link');
  return signedFiles_(s);
}

/** Backup lookup when a family lost the personal link: student ID + date of birth. */
function apiParentFind(studentId, dob) {
  studentId = clean_(studentId, 30);
  var d = normalizeDob_(dob);
  if (!rateLimit_('find:all', 300, 3600) || !rateLimit_('find:' + studentId.toLowerCase(), 5, 3600)) {
    return { state: 'locked' };
  }
  var s = studentId && d ? find_('Students', 'student_id', studentId) : null;
  if (!s || !s.dob || s.dob !== d || !s.code) return { state: 'notfound' };
  log_(s.student_id, 'Link found by ID + date of birth', '', 'parent lookup');
  return { state: 'found', code: s.code };
}

/** Checks a canvas signature (PNG data URL) and returns it as a Blob. */
function sigBlob_(dataUrl, name) {
  var m = /^data:image\/png;base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m || m[1].length < 100 || m[1].length > 700000) throw new Error('A signature is missing or too large. Please sign again.');
  var bytes = Utilities.base64Decode(m[1]);
  if ((bytes[0] & 255) !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
    throw new Error('A signature could not be read. Please sign again.');
  }
  return Utilities.newBlob(bytes, 'image/png', name);
}

/** Checks an uploaded outside form (photo or PDF) and returns it as a Blob, or null. */
function uploadBlob_(file, baseName) {
  if (!file || !file.base64) return null;
  var b64 = String(file.base64);
  if (b64.length > 7500000 || !/^[A-Za-z0-9+\/=]+$/.test(b64)) throw new Error('The uploaded file is too large or not readable.');
  var bytes = Utilities.base64Decode(b64);
  var b0 = bytes[0] & 255, b1 = bytes[1] & 255, b2 = bytes[2] & 255, b3 = bytes[3] & 255;
  var mime, ext;
  if (b0 === 0xFF && b1 === 0xD8) { mime = 'image/jpeg'; ext = 'jpg'; }
  else if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) { mime = 'image/png'; ext = 'png'; }
  else if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) { mime = 'application/pdf'; ext = 'pdf'; }
  else throw new Error('The uploaded file must be a JPG, PNG or PDF.');
  return Utilities.newBlob(bytes, mime, baseName + '.' + ext);
}

/** Two to four letters, as a person would write initials. */
function cleanInitials_(v) {
  var s = clean_(v, 8).replace(/[.\s]/g, '').toUpperCase();
  if (!/^[A-ZÀ-Þ]{1,4}$/.test(s)) throw new Error('Please type initials using 1 to 4 letters.');
  return s;
}

/**
 * Saves everything the parent and student signed in one sitting.
 * payload: {parentName, phone, email, agree, parentSig, studentSig, userAgent,
 *   parentInitials, studentInitials, dpParent:[9 x true], dpStudent:[9 x true], vzConsent ('agree' or 'decline'),   (online forms)
 *   dp: {claimed, file}, vz: {claimed, file}}                                                         (forms handled outside the app)
 */
async function apiParentSubmit(code, payload) {
  code = validCode_(code);
  var p = payload || {};
  var cfg = getConfig_();
  var online = cfg.SIGN_FORMS_ONLINE === 'Y';
  var name = clean_(p.parentName, 100), phone = clean_(p.phone, 30);
  var email = clean_(p.email, 120).toLowerCase();
  if (name.length < 2) throw new Error('Please enter the parent/guardian name.');
  if (phone.replace(/\D/g, '').length < 7) throw new Error('Please enter a valid phone number.');
  if (!isEmail_(email)) throw new Error('Please enter a valid email address.');
  if (p.agree !== true) throw new Error('Please confirm that you have read and agree.');
  var pgInitials = '', sInitials = '', vzConsent = '';
  if (online) {
    pgInitials = cleanInitials_(p.parentInitials);
    sInitials = cleanInitials_(p.studentInitials);
    var n = DP_TEXT_.checklist.length;
    var all = function (list) { return Array.isArray(list) && list.length === n && list.every(function (x) { return x === true; }); };
    if (!all(p.dpParent) || !all(p.dpStudent)) throw new Error('Every line of the Digital Promise checklist needs the parent initials and the student initials.');
    // The Verizon form asks "I hereby: Agree and Consent / DO NOT Consent". Either answer completes it.
    vzConsent = VZ_TEXT_.choices[p.vzConsent === 'agree' || p.vzConsent === 'decline' ? p.vzConsent : ''];
    if (!vzConsent) throw new Error('Please choose Agree and Consent or DO NOT Consent on the Verizon General Release.');
  }

  var s0 = findStudentByCode_(code);
  if (!s0) throw new Error('INVALID_LINK');
  if (s0.link_active !== 'Y') return { state: 'signed', date: usDate_(s0.signed_date) };

  var agreementId = newId_('AGR');
  var base = fileBase_(s0) + '_' + s0.student_id;
  var parentSig = sigBlob_(p.parentSig, base + '_' + agreementId + '_parent.png');
  var studentSig = sigBlob_(p.studentSig, base + '_' + agreementId + '_student.png');
  var upload = !online && cfg.OUTSIDE_FORMS_METHOD === 'upload';
  var dpBlob = upload ? uploadBlob_(p.dp && p.dp.file, base + '_DigitalPromise_upload') : null;
  var vzBlob = upload ? uploadBlob_(p.vz && p.vz.file, base + '_VerizonRelease_upload') : null;

  // Save the signature images first, then claim the link under the lock. If the
  // other parent submitted a moment earlier, this submission is discarded.
  var folder = studentFolder_(cfg, s0);
  var sigFolder = subFolder_(folder, '_signatures');
  var f1 = sigFolder.createFile(parentSig), f2 = sigFolder.createFile(studentSig);
  var ts = now_();
  var claimed = withLock_(function () {
    var s = findStudentByCode_(code);
    if (!s || s.link_active !== 'Y') return null;
    var patch = {
      link_active: 'N', signed_date: ts, agreement_id: agreementId,
      signer_name: name, signer_phone: phone, signer_email: email
    };
    if (online) {
      patch.vz_consent = vzConsent;
      patch.pg_initials = pgInitials;
      patch.s_initials = sInitials;
      patch.dp_status = 'Signed online';
      patch.vz_status = 'Signed online';
    }
    return update_('Students', 'student_id', s.student_id, patch);
  });
  if (!claimed) {
    try { f1.setTrashed(true); f2.setTrashed(true); } catch (e) { /* ignore */ }
    var cur = findStudentByCode_(code);
    return { state: 'signed', date: usDate_(cur ? cur.signed_date : '') };
  }
  var sid = claimed.student_id;
  var ua = clean_(p.userAgent, 300);
  insert_('Signatures', [
    { record_id: agreementId, student_id: sid, signer_type: 'parent', signer_name: name, signed_at: ts, signature_file_id: f1.getId(), user_agent: ua },
    { record_id: agreementId, student_id: sid, signer_type: 'student', signer_name: claimed.first_name + ' ' + claimed.last_name, signed_at: ts, signature_file_id: f2.getId(), user_agent: ua }
  ]);
  setStage_(sid, 'Parent signed', 'Signed by ' + name + '. Record ' + agreementId, false, 'parent link');
  setStage_(sid, 'Student signed', 'Record ' + agreementId, false, 'parent link');
  if (online) {
    log_(sid, 'Digital Promise agreement: Signed online', 'Checklist initialled by ' + pgInitials + ' (parent) and ' + sInitials + ' (student)', 'parent link');
    log_(sid, 'Verizon General Release: Signed online', vzConsent + '. Signed by ' + name + ' and the student', 'parent link');
  }

  // Forms handled outside the app: an upload, or the parent's statement, sets
  // "Signed". It never lowers a status that staff already set.
  var pending = [];
  [['dp', dpBlob, p.dp, 'Digital Promise agreement'], ['vz', vzBlob, p.vz, 'Verizon General Release']].forEach(function (f) {
    var key = f[0], blob = f[1], input = f[2] || {};
    if (!online) {
      try {
        var cur = getStudent_(sid);
        var patch = {};
        if (blob) {
          var file = folder.createFile(blob);
          patch[key + '_file_id'] = file.getId();
          if (cur[key + '_status'] !== 'Verified by staff') patch[key + '_status'] = 'Signed';
          log_(sid, f[3] + ': uploaded by parent', blob.getName(), 'parent link');
        } else if (!upload && input.claimed === true && (cur[key + '_status'] === 'Not started' || !cur[key + '_status'])) {
          patch[key + '_status'] = 'Signed';
          log_(sid, f[3] + ': parent says it is signed', 'Waiting for staff to verify', 'parent link');
        }
        if (Object.keys(patch).length) update_('Students', 'student_id', sid, patch);
      } catch (e) {
        log_(sid, f[3] + ': upload failed', e.message, 'parent link');
      }
    }
    var after = getStudent_(sid);
    if (!formOk_(after[key + '_status'], cfg) && (key === 'dp' || cfg.VERIZON_REQUIRED === 'Y')) pending.push(key);
  });
  refreshFormsStage_(sid);

  var emailed = false;
  try {
    var blobs = [(await generatePdf_(sid, 'parent link')).getBlob()];
    if (online) (await generateFormPdfs_(sid, 'parent link')).forEach(function (file) { blobs.push(file.getBlob()); });
    try { emailed = sendReceipt_(getStudent_(sid), blobs, cfg); }
    catch (e2) { log_(sid, 'Receipt email failed', e2.message, 'parent link'); }
    if (emailed) log_(sid, 'Receipt emailed', blobs.length + ' signed PDF(s) sent to the signing parent', 'parent link');
  } catch (e) {
    log_(sid, 'PDF generation failed', e.message + '. Open the student and choose "Make the PDFs again".', 'parent link');
    notifyIt_('PDF generation failed', 'Student ID ' + sid + ': ' + e.message);
  }
  // The same files that were just saved in Drive go back to the family to download.
  return { state: 'done', emailed: emailed, email: email, pending: pending, documents: online ? 3 : 1, files: signedFiles_(getStudent_(sid)) };
}
