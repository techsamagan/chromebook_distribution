/**
 * Util.gs — pure helper functions (no Google services), so they can be
 * unit-tested outside Apps Script (see tests/).
 */

/** Trim, drop control characters, cap the length. Always returns a string. */
function clean_(v, max) {
  var s = String(v === null || v === undefined ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return s.length > (max || 500) ? s.substring(0, max || 500) : s;
}

function isEmail_(s) {
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[A-Za-z]{2,}$/.test(String(s || ''));
}

/** HTML-escape for strings placed into the PDF and HTML emails. */
function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Sheets treats text starting with = + - @ as a formula. A leading apostrophe
 * forces plain text, which blocks formula injection from CSV or form input.
 */
function safeCell_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /^[=+\-@\t\r']/.test(s) ? "'" + s : s;
}

/** Reverse of safeCell_ in case Sheets returns the apostrophe with the text. */
function unsafeCell_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /^'[=+\-@]/.test(s) ? s.substring(1) : s;
}

/** CSV cell: quoted when needed, and formula-proof for Excel/Sheets/Asset Tiger. */
function csvCell_(v) {
  var s = String(v === null || v === undefined ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv_(headers, rows) {
  var out = [headers.map(csvCell_).join(',')];
  rows.forEach(function (r) { out.push(r.map(csvCell_).join(',')); });
  return out.join('\r\n') + '\r\n';
}

function normHeader_(h) {
  return String(h || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Parses CSV text, or a table pasted from Excel/Sheets (tab separated).
 * Returns {headers: [...], records: [{line, data: {header: value}}]}.
 */
function parseDelimited_(text) {
  text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  var delim = text.split('\n')[0].indexOf('\t') >= 0 ? '\t' : ',';
  var rows = [], row = [], cur = '', quoted = false, started = false;
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (quoted) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"' && !started) { quoted = true; started = true; }
    else if (c === delim) { row.push(cur); cur = ''; started = false; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; started = false; }
    else { cur += c; started = true; }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return { headers: [], records: [] };
  var headers = rows[0].map(normHeader_);
  var records = [];
  for (var r = 1; r < rows.length; r++) {
    var data = {}, empty = true;
    for (var j = 0; j < headers.length; j++) {
      if (!headers[j]) continue;
      var v = clean_(rows[r][j], 300);
      data[headers[j]] = v;
      if (v) empty = false;
    }
    if (!empty) records.push({ line: r + 1, data: data });
  }
  return { headers: headers, records: records };
}

function normalizeLang_(v) {
  var s = String(v || '').toLowerCase().trim();
  if (!s) return 'en';
  if (s === 'es' || s.indexOf('span') === 0 || s.indexOf('esp') === 0) return 'es';
  if (s === 'en' || s.indexOf('eng') === 0 || s.indexOf('ing') === 0) return 'en';
  return '';
}

/** Accepts 2014-03-09 or 3/9/2014 (month first). Returns yyyy-MM-dd, or '' if invalid. */
function normalizeDob_(v) {
  var s = String(v || '').trim(), m, y, mo, d;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s))) { mo = +m[1]; d = +m[2]; y = +m[3]; }
  else return '';
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
}

/** Maps an import row (CSV template names) to the Students tab field names. */
function normalizeStudent_(raw) {
  raw = raw || {};
  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      if (raw[arguments[i]] !== undefined && raw[arguments[i]] !== '') return raw[arguments[i]];
    }
    return '';
  }
  var dobRaw = clean_(pick('date_of_birth', 'dob', 'birth_date', 'birthdate'), 20);
  var langRaw = clean_(pick('preferred_language', 'language'), 20);
  return {
    student_id: clean_(pick('student_id', 'id'), 30),
    first_name: clean_(pick('student_first_name', 'first_name', 'first'), 60),
    last_name: clean_(pick('student_last_name', 'last_name', 'last'), 60),
    grade: clean_(pick('grade'), 10).replace(/^(grade|gr\.?)\s*/i, '').replace(/(st|nd|rd|th)$/i, ''),
    dob: dobRaw ? (normalizeDob_(dobRaw) || 'INVALID') : '',
    parent1_name: clean_(pick('parent1_name'), 100),
    parent1_email: clean_(pick('parent1_email'), 120).toLowerCase(),
    parent1_phone: clean_(pick('parent1_phone'), 30),
    parent2_name: clean_(pick('parent2_name'), 100),
    parent2_email: clean_(pick('parent2_email'), 120).toLowerCase(),
    parent2_phone: clean_(pick('parent2_phone'), 30),
    language: langRaw ? (normalizeLang_(langRaw) || 'INVALID') : 'en'
  };
}

/** Returns a list of problems (empty = valid) for a normalized student. */
function validateStudent_(s, gradeMin, gradeMax) {
  var p = [];
  if (!s.student_id) p.push('Missing student ID');
  else if (!/^[A-Za-z0-9._\-]{1,30}$/.test(s.student_id)) p.push('Student ID may only contain letters, numbers, . _ -');
  if (!s.first_name) p.push('Missing first name');
  if (!s.last_name) p.push('Missing last name');
  if (!s.grade) p.push('Missing grade');
  else if (!/^\d{1,2}$/.test(s.grade) || +s.grade < gradeMin || +s.grade > gradeMax) {
    p.push('Grade must be ' + gradeMin + '-' + gradeMax);
  }
  if (!s.parent1_email && !s.parent1_phone && !s.parent2_email && !s.parent2_phone) {
    p.push('Need at least one parent email or phone');
  }
  if (s.parent1_email && !isEmail_(s.parent1_email)) p.push('Parent 1 email is not valid');
  if (s.parent2_email && !isEmail_(s.parent2_email)) p.push('Parent 2 email is not valid');
  if (s.dob === 'INVALID') p.push('Date of birth must be YYYY-MM-DD or MM/DD/YYYY');
  if (s.language === 'INVALID') p.push('Language must be English or Spanish');
  return p;
}

/** Fields an import or an Admin edit may change. Signing data is never touched. */
var STUDENT_EDITABLE_ = ['first_name', 'last_name', 'grade', 'dob', 'parent1_name', 'parent1_email',
  'parent1_phone', 'parent2_name', 'parent2_email', 'parent2_phone', 'language'];

/** Lists {field, old, new} for editable fields that differ. Blank incoming optional values do not erase. */
function diffStudent_(existing, incoming, keepBlank) {
  var changes = [];
  STUDENT_EDITABLE_.forEach(function (f) {
    var a = String(existing[f] || ''), b = String(incoming[f] || '');
    if (keepBlank && b === '') return;
    if (f === 'language' && keepBlank && !a && b === 'en') return;
    if (a !== b) changes.push({ field: f, old: a, 'new': b });
  });
  return changes;
}

function parseShare_(name, value) {
  var m = /^\s*(\d+(?:\.\d+)?)\s*%?\s*\/\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(String(value || ''));
  return { name: name, school: m ? +m[1] : 0, student: m ? +m[2] : 100 };
}

/**
 * Cost sharing for the Nth repair of a student (N starts at 1).
 * The last row of the table applies to every later repair.
 */
function costShare_(repairNumber, cost, shares) {
  var n = Math.max(1, parseInt(repairNumber, 10) || 1);
  var row = shares[Math.min(n, shares.length) - 1] || { school: 0, student: 100 };
  var c = Math.round((parseFloat(cost) || 0) * 100);
  var studentCents = Math.round(c * row.student / 100);
  return {
    schoolPct: row.school, studentPct: row.student,
    school: ((c - studentCents) / 100).toFixed(2), student: (studentCents / 100).toFixed(2)
  };
}

function money_(v) {
  var n = parseFloat(v);
  return isNaN(n) ? '' : '$' + n.toFixed(2);
}

/** LastName_FirstName_Gr[Grade]_[AssetTag or PENDING].pdf */
function pdfFileName_(last, first, grade, assetTag) {
  function part(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9\-]+/g, '') || 'X';
  }
  return part(last) + '_' + part(first) + '_Gr' + part(grade) + '_' +
    (assetTag ? part(assetTag) : 'PENDING') + '.pdf';
}

/** Implementation Plan rule: grade 5 -> Elementary Student, grades 6-12 -> Secondary Student. */
function assetTigerGroup_(grade, elementaryLabel, secondaryLabel) {
  return parseInt(grade, 10) <= 5 ? (elementaryLabel || 'Elementary Student') : (secondaryLabel || 'Secondary Student');
}

/** Replaces {{name}} placeholders. Unknown placeholders are left empty. */
function fillTemplate_(text, vars) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, function (m, k) {
    return vars[k] === undefined ? '' : String(vars[k]);
  });
}

/** Maps flexible device CSV headers (e.g. Digital Promise export) to Devices tab fields. */
var DEVICE_ALIASES_ = {
  asset_tag: ['asset_tag', 'asset_tag_id', 'asset_tag_no', 'asset_tag_number', 'asset', 'tag', 'asset_id'],
  serial_number: ['serial_number', 'serial', 'serial_no', 'sn', 'device_serial_number', 'serial_num'],
  model: ['model', 'device_model', 'description'],
  imei: ['imei', 'imei_number'],
  mac: ['mac', 'mac_address', 'wifi_mac', 'wi_fi_mac', 'wlan_mac'],
  mdn: ['mdn', 'mobile_number', 'phone_number', 'mobile_directory_number'],
  iccid: ['iccid', 'sim', 'sim_number', 'sim_id', 'iccid_number'],
  notes: ['notes', 'note', 'comments']
};

function normalizeDevice_(raw, defaultModel) {
  var d = {};
  Object.keys(DEVICE_ALIASES_).forEach(function (field) {
    d[field] = '';
    DEVICE_ALIASES_[field].some(function (alias) {
      if (raw[alias]) { d[field] = clean_(raw[alias], field === 'notes' ? 300 : 60); return true; }
      return false;
    });
  });
  if (!d.model) d.model = defaultModel || '';
  return d;
}

function validateDevice_(d) {
  var p = [];
  if (!d.asset_tag) p.push('Missing asset tag');
  else if (!/^[A-Za-z0-9._\-]{1,40}$/.test(d.asset_tag)) p.push('Asset tag may only contain letters, numbers, . _ -');
  if (!d.serial_number) p.push('Missing serial number');
  return p;
}
