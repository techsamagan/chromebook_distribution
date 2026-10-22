/**
 * Reports.gs — overview numbers, missing-forms list, claims rate, QR letters.
 */

function apiOverview() {
  requireRole_(ROLES_IT);
  var cfg = getConfig_();
  var keys = ['total', 'noEmail', 'invited', 'opened', 'signed', 'formsDone', 'station1', 'assigned', 'working', 'assetTiger'];
  function blank() { var o = {}; keys.forEach(function (k) { o[k] = 0; }); return o; }
  var inAt = {};
  rows_('Checkouts').forEach(function (c) {
    if (c.type === 'Assigned' && !c.returned_date && c.asset_tiger_date) inAt[c.student_id] = true;
  });
  var totals = blank(), byGrade = {}, stages = {};
  rows_('Students').forEach(function (s) {
    var g = byGrade[s.grade] || (byGrade[s.grade] = blank());
    function add(k) { totals[k]++; g[k]++; }
    add('total');
    if (!hasEmail_(s)) add('noEmail');
    if (s.invite_first_sent) add('invited');
    if (s.link_opened_date) add('opened');
    if (s.signed_date) add('signed');
    if (readiness_(s, cfg).ready) add('formsDone');
    if (s.station1_date) add('station1');
    if (s.asset_tag) add('assigned');
    if (s.asset_tag && s.working_date) add('working');
    if (s.asset_tag && inAt[s.student_id]) add('assetTiger');
    stages[s.stage] = (stages[s.stage] || 0) + 1;
  });
  var grades = Object.keys(byGrade).sort(function (a, b) { return a - b; }).map(function (g) {
    byGrade[g].grade = g;
    return byGrade[g];
  });
  var devices = {};
  rows_('Devices').forEach(function (d) { devices[d.status] = (devices[d.status] || 0) + 1; });
  return { totals: totals, grades: grades, stages: stages, devices: devices };
}

/** Students not ready for deployment, and exactly what each one is missing. */
function missingForms_(withContact) {
  var cfg = getConfig_();
  var out = [];
  rows_('Students').forEach(function (s) {
    var r = readiness_(s, cfg);
    if (r.ready) return;
    var item = { id: s.student_id, first: s.first_name, last: s.last_name, grade: s.grade, missing: r.missing, stage: s.stage };
    if (withContact) {
      item.contact = [s.parent1_name, s.parent1_phone, s.parent1_email].filter(String).join(' · ');
    }
    out.push(item);
  });
  out.sort(function (a, b) { return (a.grade - b.grade) || a.last.localeCompare(b.last); });
  return out;
}

/**
 * Claims rate: repair + lost + stolen records opened in the last two years,
 * divided by the number of devices that are not retired.
 */
function claims_(cfg) {
  var cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  var cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var incidents = rows_('Repairs').filter(function (r) { return r.status !== 'Cancelled' && r.opened_date >= cutoffStr; }).length;
  var fleet = rows_('Devices').filter(function (d) { return d.status !== 'Retired'; }).length;
  var rate = fleet ? Math.round(incidents / fleet * 1000) / 10 : 0;
  var threshold = parseFloat(cfg.CLAIMS_THRESHOLD_PCT) || 20, warn = parseFloat(cfg.CLAIMS_WARN_PCT) || 15;
  return { incidents: incidents, fleet: fleet, rate: rate, threshold: threshold, warn: warn,
    level: rate >= threshold ? 'over' : (rate >= warn ? 'warn' : 'ok') };
}

/** The numbers behind the Home page: what is waiting at each step of the project. */
function apiHome() {
  var staff = requireRole_(ROLES_IT);
  var cfg = getConfig_();
  var h = { students: 0, notSent: 0, noEmail: 0, toRemind: 0, signed: 0, notReady: 0, readyNoDevice: 0,
    withDevice: 0, working: 0, onHold: 0 };
  rows_('Students').forEach(function (s) {
    h.students++;
    var open = !s.signed_date && s.link_active === 'Y';
    if (s.signed_date) h.signed++;
    if (open && !hasEmail_(s)) h.noEmail++;
    if (open && hasEmail_(s)) { if (s.invite_first_sent) h.toRemind++; else h.notSent++; }
    var ready = readiness_(s, cfg).ready;
    if (!ready) h.notReady++;
    if (ready && !s.asset_tag) h.readyNoDevice++;
    if (s.asset_tag) h.withDevice++;
    if (s.asset_tag && s.working_date) h.working++;
    if (s.stage === 'Not returned – records hold') h.onHold++;
  });
  var devices = rows_('Devices');
  h.devices = devices.length;
  h.inStock = devices.filter(function (d) { return d.status === 'In stock'; }).length;
  var now = now_(), checkouts = rows_('Checkouts');
  h.assetTigerWaiting = checkouts.filter(function (c) { return c.type === 'Assigned' && !c.returned_date && !c.asset_tiger_date; }).length;
  h.loanersOut = checkouts.filter(function (c) { return c.type === 'Loaner' && !c.returned_date; }).length;
  h.loanersLate = checkouts.filter(function (c) { return c.type === 'Loaner' && !c.returned_date && c.due && c.due < now; }).length;
  var repairs = rows_('Repairs');
  h.openRepairs = repairs.filter(isOpenRepair_).length;
  h.unpaid = repairs.filter(function (r) { return r.status !== 'Cancelled' && parseFloat(r.student_share) > 0 && r.paid !== 'Y'; }).length;
  h.claims = claims_(cfg);
  h.linkReady = !!cfg.PARENT_APP_URL;
  h.formsReady = formsReady_(cfg);
  if (staff.role === ROLE_ADMIN) {
    h.queued = rows_('MailQueue').length;
    h.quota = MailApp.getRemainingDailyQuota();
  }
  return h;
}

function apiReports() {
  var staff = requireRole_(ROLES_IT);
  var cfg = getConfig_();
  var withContact = canSeeContact_(staff, cfg);
  var names = {};
  rows_('Students').forEach(function (s) { names[s.student_id] = s; });


  var now = now_();
  var overdue = rows_('Checkouts').filter(function (c) { return c.type === 'Loaner' && !c.returned_date && c.due && c.due < now; })
    .map(function (c) {
      var s = names[c.student_id];
      return { student: s ? s.first_name + ' ' + s.last_name : c.student_id, grade: s ? s.grade : '', tag: c.asset_tag, due: c.due };
    });
  var notReturned = rows_('Students').filter(function (s) { return s.stage === 'Not returned – records hold'; })
    .map(function (s) {
      return { id: s.student_id, name: s.first_name + ' ' + s.last_name, grade: s.grade, tag: s.asset_tag, since: s.stage_date };
    });
  var unpaid = rows_('Repairs').filter(function (r) { return r.status !== 'Cancelled' && parseFloat(r.student_share) > 0 && r.paid !== 'Y'; })
    .map(function (r) {
      var s = names[r.student_id];
      return { id: r.repair_id, student: s ? s.first_name + ' ' + s.last_name : r.student_id, tag: r.asset_tag, owed: r.student_share, type: r.type };
    });
  return {
    claims: claims_(cfg),
    overdueLoaners: overdue, notReturned: notReturned, unpaid: unpaid,
    missing: missingForms_(withContact), withContact: withContact
  };
}

function apiMissingFormsCsv() {
  var staff = requireRole_(ROLES_IT);
  var withContact = canSeeContact_(staff, getConfig_());
  var list = missingForms_(withContact);
  var headers = ['Student ID', 'Last Name', 'First Name', 'Grade', 'Stage', 'Missing'];
  if (withContact) headers.push('Parent Contact');
  log_('', 'Missing forms list exported', list.length + ' student(s)');
  return toCsv_(headers, list.map(function (m) {
    var row = [m.id, m.last, m.first, m.grade, m.stage, m.missing.join('; ')];
    if (withContact) row.push(m.contact);
    return row;
  }));
}

/* ---------------- Check-outs: who got which Chromebook, from whom, and when ---------------- */

var CHECKOUT_HEADERS_ = ['Date and time', 'Student', 'Grade', 'Student ID', 'Asset tag', 'Serial number',
  'Checked out by', 'Staff email', 'Kind', 'Checked working', 'Returned'];

/** Every check-out, newest first, with names instead of IDs. */
function checkoutRows_() {
  var students = {}, devices = {}, staff = {};
  rows_('Students').forEach(function (s) { students[s.student_id] = s; });
  rows_('Devices').forEach(function (d) { devices[d.asset_tag] = d; });
  rows_('Staff').forEach(function (s) { staff[String(s.email).toLowerCase()] = s.name; });
  return rows_('Checkouts').map(function (c) {
    var s = students[c.student_id] || {};
    var current = !c.returned_date && s.asset_tag === c.asset_tag;
    return {
      at: c.checked_out_at, student: s.first_name ? s.first_name + ' ' + s.last_name : c.student_id, grade: s.grade || '',
      studentId: c.student_id, tag: c.asset_tag, serial: (devices[c.asset_tag] || {}).serial_number || '',
      by: staff[String(c.staff_email).toLowerCase()] || c.staff_email, byEmail: c.staff_email,
      kind: c.type === 'Loaner' ? 'Loaner' : 'Chromebook', working: current && c.type !== 'Loaner' ? s.working_date : '', returned: c.returned_date
    };
  }).reverse();
}

function checkoutTable_() {
  return checkoutRows_().map(function (r) {
    return [r.at, r.student, r.grade, r.studentId, r.tag, r.serial, r.by, r.byEmail, r.kind, r.working, r.returned];
  });
}

/** The check-outs list for the staff app. */
function apiListCheckouts() {
  requireRole_(ROLES_IT);
  return checkoutRows_();
}

/** The same list as a spreadsheet file to download. */
function apiCheckoutsCsv() {
  requireRole_(ROLES_IT);
  var rows = checkoutTable_();
  log_('', 'Check-outs list downloaded', rows.length + ' row(s)');
  return toCsv_(CHECKOUT_HEADERS_, rows);
}

/**
 * Saves the list as a new Google Sheet in the school's Drive folder, named
 * with the date and time it was made. Admin only, because it creates a file.
 */
function apiCheckoutsToSheet() {
  requireRole_(ROLES_ADMIN);
  var cfg = getConfig_();
  var rows = [CHECKOUT_HEADERS_].concat(checkoutTable_()).map(function (r) { return r.map(safeCell_); });
  var name = 'Chromebook check-outs ' + now_().substring(0, 16);
  var ss = SpreadsheetApp.create(name);
  var sh = ss.getSheets()[0];
  if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
  sh.getRange(1, 1, rows.length, CHECKOUT_HEADERS_.length).setNumberFormat('@').setValues(rows);
  sh.setFrozenRows(1);
  var where = 'your My Drive';
  try {
    var folder = yearFolder_(cfg);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    where = 'the folder "' + folder.getName() + '"';
  } catch (e) { /* stays in My Drive */ }
  log_('', 'Check-outs saved as a Google Sheet', name + ' (' + (rows.length - 1) + ' row(s))');
  return { url: ss.getUrl(), name: name, rows: rows.length - 1, where: where };
}

/** Data for printable QR letters (students without email, or any selected students). */
function apiQrData(ids) {
  requireRole_(ROLES_IT);
  var cfg = getConfig_();
  if (!cfg.PARENT_APP_URL) throw new Error('Set PARENT_APP_URL in Settings first.');
  var want = {};
  (ids || []).slice(0, 2000).forEach(function (id) { want[String(id)] = true; });
  var out = rows_('Students').filter(function (s) { return want[s.student_id] && s.link_active === 'Y'; }).map(function (s) {
    return { name: s.first_name + ' ' + s.last_name, grade: s.grade, lang: s.language === 'es' ? 'es' : 'en', link: linkFor_(s.code) };
  });
  log_('', 'QR letters printed', out.length + ' student(s)');
  return { school: cfg.SCHOOL_NAME, itEmail: cfg.IT_EMAIL, letters: out };
}
