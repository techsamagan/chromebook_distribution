/**
 * Students.gs — student records: import, add, edit, list, detail, stages.
 */

/** 16 random characters (no look-alike letters), about 92 bits: not guessable. */
function randomCode_() {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var seed = Utilities.getUuid() + Utilities.getUuid() + new Date().getTime();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  var out = '';
  for (var i = 0; i < 16; i++) out += alphabet.charAt((bytes[i] & 255) % alphabet.length);
  return out;
}

function uniqueCode_(taken) {
  var code;
  do { code = randomCode_(); } while (taken[code]);
  taken[code] = true;
  return code;
}

function takenCodes_() {
  var taken = {};
  rows_('Students').forEach(function (s) { if (s.code) taken[s.code] = true; });
  return taken;
}

/** Builds a complete new Students row from the editable fields. Call under the lock. */
function newStudentRow_(s, taken) {
  var code = uniqueCode_(taken || takenCodes_());
  var row = {};
  STUDENT_EDITABLE_.forEach(function (f) { row[f] = s[f] || ''; });
  row.student_id = s.student_id;
  row.language = row.language || 'en';
  row.code = code;
  row.link = linkFor_(code);
  row.link_active = 'Y';
  row.reminders_count = '0';
  row.stage = 'Imported';
  row.stage_date = now_();
  row.dp_status = 'Not started';
  row.vz_status = 'Not started';
  return row;
}

function getStudent_(studentId) {
  var s = find_('Students', 'student_id', clean_(studentId, 30));
  if (!s) throw new Error('Student not found.');
  return s;
}

/**
 * Sets a student's stage and logs it. Normal stages only move forward; pass
 * force=true for after-deployment stages or a deliberate reset.
 */
function setStage_(studentId, stage, details, force, userEmail) {
  return withLock_(function () {
    var s = getStudent_(studentId);
    var cur = STAGES.indexOf(s.stage), next = STAGES.indexOf(stage);
    var move = force || s.stage === '' || (next >= 0 && cur >= 0 && next > cur);
    if (move && s.stage !== stage) {
      update_('Students', 'student_id', s.student_id, { stage: stage, stage_date: now_() });
    }
    log_(s.student_id, 'Stage: ' + stage, details || '', userEmail);
    return s;
  });
}

function formOk_(status, cfg) {
  if (status === 'Verified by staff' || status === 'Signed online') return true;
  return status === 'Signed' && cfg.OUTSIDE_FORMS_REQUIRE_STAFF_VERIFY !== 'Y';
}

/** The rule from the plan: no device unless the checkout form and Digital Promise form are done. */
function readiness_(s, cfg) {
  var missing = [];
  if (!s.signed_date) missing.push('Chromebook Checkout Form is not signed');
  if (!formOk_(s.dp_status, cfg)) {
    missing.push('Digital Promise agreement: ' + (s.dp_status === 'Signed' ? 'waiting for staff to verify' : 'not received'));
  }
  if (cfg.VERIZON_REQUIRED === 'Y' && !formOk_(s.vz_status, cfg)) {
    missing.push('Verizon General Release: ' + (s.vz_status === 'Signed' ? 'waiting for staff to verify' : 'not received'));
  }
  return { ready: missing.length === 0, missing: missing };
}

/** Moves the student to "Outside forms complete" once everything required is in. */
function refreshFormsStage_(studentId) {
  var s = getStudent_(studentId), cfg = getConfig_();
  if (readiness_(s, cfg).ready && STAGES.indexOf(s.stage) < STAGES.indexOf('Outside forms complete') && STAGES.indexOf(s.stage) >= 0) {
    setStage_(studentId, 'Outside forms complete', '');
  }
}

/**
 * The student's situation as one plain sentence for staff screens. The stored
 * stage names (STAGES) are unchanged; this is only how they are shown.
 * tone: 'ok' | 'warn' | 'bad' | ''
 */
function statusOf_(s, cfg) {
  var post = {
    'Repair open': ['Chromebook is in for repair', 'warn'],
    'Loaner issued': ['Has a loaner Chromebook', 'warn'],
    'Lost/Stolen reported': ['Chromebook reported lost or stolen', 'bad'],
    'Returned': ['Chromebook returned', ''],
    'Not returned – records hold': ['Chromebook not returned, records on hold', 'bad']
  };
  if (post[s.stage]) return { text: post[s.stage][0], tone: post[s.stage][1] };
  if (s.asset_tag) {
    return s.working_date ? { text: 'Has Chromebook ' + s.asset_tag, tone: 'ok' }
      : { text: 'Has Chromebook ' + s.asset_tag + ', not checked yet', tone: 'warn' };
  }
  if (readiness_(s, cfg).ready) {
    return { text: s.station1_date ? 'Forms checked, waiting for a Chromebook' : 'Ready for a Chromebook', tone: 'ok' };
  }
  if (s.signed_date) {
    var form = !formOk_(s.dp_status, cfg) ? ['Digital Promise form', s.dp_status] : ['Verizon release', s.vz_status];
    return { text: 'Signed. ' + form[0] + (form[1] === 'Signed' ? ' needs checking by staff' : ' is missing'), tone: 'warn' };
  }
  if (s.link_opened_date) return { text: 'Opened the link, has not signed', tone: 'warn' };
  if (s.invite_first_sent) return { text: 'Link sent, has not signed', tone: 'warn' };
  if (!hasEmail_(s)) return { text: 'No email on file, link not sent', tone: 'bad' };
  return { text: 'Link not sent yet', tone: '' };
}

/** The one thing to do next for this student on deployment day. */
function nextStep_(s, cfg) {
  if (POST_STAGES.indexOf(s.stage) >= 0) return 'after';   // repair, loaner, lost, returned: IT handles these
  if (!s.signed_date) return 'sign';
  if (!readiness_(s, cfg).ready) return 'forms';
  if (!s.asset_tag) return s.station1_date ? 'assign' : 'verify';
  return s.working_date ? 'done' : 'check';
}

function hasEmail_(s) {
  return isEmail_(s.parent1_email) || isEmail_(s.parent2_email);
}

function canSeeContact_(staff, cfg) {
  return staff.role === ROLE_ADMIN || (staff.role === ROLE_IT && cfg.IT_STAFF_SEE_CONTACT === 'Y');
}

/* ---------------- List and detail (Admin, IT Staff) ---------------- */

function apiListStudents() {
  requireRole_(ROLES_IT);
  var cfg = getConfig_();
  return rows_('Students').map(function (s) {
    return {
      id: s.student_id, first: s.first_name, last: s.last_name, grade: s.grade,
      stage: s.stage, status: statusOf_(s, cfg), hasEmail: hasEmail_(s), invited: !!s.invite_first_sent,
      reminders: s.reminders_count || '0', opened: !!s.link_opened_date,
      signed: !!s.signed_date, dp: s.dp_status, vz: s.vz_status,
      ready: readiness_(s, cfg).ready, tag: s.asset_tag
    };
  });
}

function apiStudentDetail(studentId) {
  var staff = requireRole_(ROLES_IT);
  var cfg = getConfig_();
  var s = getStudent_(studentId);
  var out = {
    student_id: s.student_id, first_name: s.first_name, last_name: s.last_name, grade: s.grade,
    language: s.language, stage: s.stage, stage_date: s.stage_date, status: statusOf_(s, cfg), step: nextStep_(s, cfg),
    link_active: s.link_active === 'Y', invite_first_sent: s.invite_first_sent,
    reminders_count: s.reminders_count, last_sent: s.last_sent, link_opened_date: s.link_opened_date,
    signed_date: s.signed_date, signer_name: s.signer_name, agreement_id: s.agreement_id,
    has_pdf: !!s.pdf_file_id, has_dp_pdf: !!s.dp_pdf_file_id, has_vz_pdf: !!s.vz_pdf_file_id, has_record: !!s.checkout_pdf_file_id, dp_status: s.dp_status, vz_status: s.vz_status, vz_consent: s.vz_consent,
    has_dp_file: !!s.dp_file_id, has_vz_file: !!s.vz_file_id,
    station1_date: s.station1_date, asset_tag: s.asset_tag, working_date: s.working_date,
    notes: s.notes, hasEmail: hasEmail_(s), readiness: readiness_(s, cfg),
    canSeeContact: canSeeContact_(staff, cfg)
  };
  if (out.canSeeContact) {
    ['dob', 'parent1_name', 'parent1_email', 'parent1_phone', 'parent2_name', 'parent2_email',
      'parent2_phone', 'signer_phone', 'signer_email', 'signer_address'].forEach(function (f) { out[f] = s[f]; });
  }
  out.device = s.asset_tag ? deviceView_(find_('Devices', 'asset_tag', s.asset_tag)) : null;
  out.checkouts = filter_('Checkouts', 'student_id', s.student_id).map(stripRow_);
  out.repairs = filter_('Repairs', 'student_id', s.student_id).map(repairView_);
  out.activity = filter_('ActivityLog', 'student_id', s.student_id).slice(-150).reverse().map(function (a) {
    return { timestamp: a.timestamp, user: a.user_email, action: a.action, details: a.details };
  });
  return out;
}

function stripRow_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; });
  return c;
}

/** The personal link, for "Copy link" (text it or read it to a parent). */
function apiGetLink(studentId) {
  requireRole_(ROLES_IT);
  var s = getStudent_(studentId);
  var link = linkFor_(s.code);
  if (!link) throw new Error('Set PARENT_APP_URL in Settings first.');
  log_(s.student_id, 'Link copied', '');
  return { link: link, active: s.link_active === 'Y' };
}

/* ---------------- Add / edit one student (Admin) ---------------- */

function apiSaveStudent(data, isNew) {
  requireRole_(ROLES_ADMIN);
  var cfg = getConfig_();
  var s = normalizeStudent_(data || {});
  var problems = validateStudent_(s, +cfg.GRADE_MIN, +cfg.GRADE_MAX);
  if (problems.length) throw new Error(problems.join('. ') + '.');
  return withLock_(function () {
    var existing = find_('Students', 'student_id', s.student_id);
    if (isNew) {
      if (existing) throw new Error('A student with ID ' + s.student_id + ' already exists.');
      insert_('Students', [newStudentRow_(s)]);
      log_(s.student_id, 'Student added', s.first_name + ' ' + s.last_name + ', grade ' + s.grade);
      log_(s.student_id, 'Stage: Imported', 'Added manually');
    } else {
      if (!existing) throw new Error('Student not found.');
      var changes = diffStudent_(existing, s, false);
      if (changes.length) {
        var patch = {};
        changes.forEach(function (c) { patch[c.field] = c['new']; });
        update_('Students', 'student_id', s.student_id, patch);
        changes.forEach(function (c) {
          log_(s.student_id, 'Student edited', c.field + ': "' + c.old + '" -> "' + c['new'] + '"');
        });
      }
    }
    return s.student_id;
  });
}

/** Generates a new personal link; the old one stops working immediately. */
function apiNewLink(studentId) {
  requireRole_(ROLES_ADMIN);
  return withLock_(function () {
    var s = getStudent_(studentId);
    var code = uniqueCode_(takenCodes_());
    update_('Students', 'student_id', s.student_id, { code: code, link: linkFor_(code), link_active: 'Y' });
    log_(s.student_id, 'New link generated', 'Old link disabled' + (s.signed_date ? ' (was already signed on ' + s.signed_date + ')' : ''));
    return { link: linkFor_(code) };
  });
}

/* ---------------- Bulk import (Admin) ---------------- */

/** Parses and checks the file. Nothing is saved. */
function apiImportPreview(text) {
  requireRole_(ROLES_ADMIN);
  return importAnalyze_(text);
}

function importAnalyze_(text) {
  if (String(text || '').length > 3000000) throw new Error('The file is too large (limit about 3 MB).');
  var cfg = getConfig_();
  var parsed = parseDelimited_(text);
  if (parsed.headers.indexOf('student_id') < 0) {
    throw new Error('The first row must contain the column names from the template (student_id, student_first_name, ...).');
  }
  if (parsed.records.length > 5000) throw new Error('Too many rows (limit 5000 per import).');
  var seen = {}, dup = {};
  parsed.records.forEach(function (r) {
    var id = clean_(r.data.student_id, 30);
    if (id) { if (seen[id]) dup[id] = true; seen[id] = true; }
  });
  var byId = {};
  rows_('Students').forEach(function (s) { byId[s.student_id] = s; });
  var out = [];
  parsed.records.forEach(function (r) {
    var s = normalizeStudent_(r.data);
    var problems = validateStudent_(s, +cfg.GRADE_MIN, +cfg.GRADE_MAX);
    if (s.student_id && dup[s.student_id]) problems.push('This student ID appears more than once in the file');
    var item = { line: r.line, data: s, status: 'new', problems: problems, changes: [] };
    if (problems.length) item.status = 'problem';
    else if (byId[s.student_id]) {
      item.changes = diffStudent_(byId[s.student_id], s, true);
      item.status = item.changes.length ? 'update' : 'same';
    }
    out.push(item);
  });
  return out;
}

/**
 * Saves the valid rows. New students are always added; an existing student is
 * only changed if the Admin approved that ID. Never deletes, never touches
 * signatures, links, stages or devices, and never sends email.
 */
function apiImportCommit(text, approvedIds) {
  requireRole_(ROLES_ADMIN);
  var approved = {};
  (approvedIds || []).forEach(function (id) { approved[String(id)] = true; });
  var result = { added: 0, updated: 0, skipped: 0 };
  var logs = [];
  withLock_(function () {
    var items = importAnalyze_(text);
    var taken = takenCodes_();
    var toAdd = [], toUpdate = [];
    items.forEach(function (it) {
      if (it.status === 'new') {
        toAdd.push(newStudentRow_(it.data, taken));
        logs.push([it.data.student_id, 'Stage: Imported', 'CSV import']);
      } else if (it.status === 'update' && approved[it.data.student_id]) {
        var row = find_('Students', 'student_id', it.data.student_id);
        it.changes.forEach(function (c) {
          row[c.field] = c['new'];
          logs.push([row.student_id, 'Student edited (import)', c.field + ': "' + c.old + '" -> "' + c['new'] + '"']);
        });
        toUpdate.push(row);
      } else if (it.status !== 'same') result.skipped++;
    });
    updateMany_('Students', toUpdate);
    insert_('Students', toAdd);
    result.added = toAdd.length;
    result.updated = toUpdate.length;
    var me = currentEmail_(), ts = now_();
    insert_('ActivityLog', logs.map(function (l) {
      return { timestamp: ts, user_email: me, student_id: l[0], action: l[1], details: clean_(l[2], 1000) };
    }));
  });
  log_('', 'Student import', result.added + ' added, ' + result.updated + ' updated, ' + result.skipped + ' skipped');
  return result;
}

/** The blank CSV template (with one example row). */
function apiImportTemplate() {
  requireRole_(ROLES_ADMIN);
  return toCsv_(STUDENT_IMPORT_FIELDS, [['123456', 'Jane', 'Doe', '7', 'Maria Doe', 'maria.doe@example.com',
    '505-555-0100', '', '', '', 'English', '2013-04-21']]);
}

/* ---------------- Outside forms (Digital Promise, Verizon) ---------------- */

function apiSetOutsideForm(studentId, form, status) {
  var staff = requireRole_(ROLES_ALL);
  var cfg = getConfig_();
  if (form !== 'dp' && form !== 'vz') throw new Error('Unknown form.');
  if (FORM_STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  if (staff.role === ROLE_HELPER) {
    if (cfg.HELPERS_CAN_VERIFY_FORMS !== 'Y' || status !== 'Verified by staff') {
      throw new Error('Please ask IT staff to verify this form.');
    }
  }
  var label = form === 'dp' ? 'Digital Promise agreement' : 'Verizon General Release';
  withLock_(function () {
    var s = getStudent_(studentId);
    var field = form + '_status';
    if (s[field] === status) return;
    var old = s[field];
    var patch = {};
    patch[field] = status;
    update_('Students', 'student_id', s.student_id, patch);
    log_(s.student_id, label + ': ' + status, 'Was: ' + (old || 'Not started'));
    refreshFormsStage_(s.student_id);
  });
  return staff.role === ROLE_HELPER ? apiStationGet(studentId) : true;
}

/** An uploaded outside form (photo/PDF), streamed through the app so Drive stays Admin-only. */
function apiGetOutsideFile(studentId, form) {
  requireRole_(ROLES_IT);
  if (form !== 'dp' && form !== 'vz') throw new Error('Unknown form.');
  var s = getStudent_(studentId);
  var id = s[form + '_file_id'];
  if (!id) throw new Error('No uploaded file for this form.');
  var blob = DriveApp.getFileById(id).getBlob();
  log_(s.student_id, 'Outside form viewed', form === 'dp' ? 'Digital Promise' : 'Verizon');
  return { name: blob.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}
