/**
 * Db.gs — the Google Sheet as a database.
 *
 * - Columns are found by header NAME, never by position, so the school can
 *   reorder or add columns without breaking the app.
 * - Every cell is stored as plain text and read as text.
 * - Every write happens inside withLock_(), and re-reads the sheet first, so
 *   several stations saving at the same moment never overwrite each other.
 */

var SS_ = null;
var TCACHE_ = {};
var HCACHE_ = {};
var LOCK_ = null;
var LOCK_DEPTH_ = 0;
var LOG_BUFFER_ = [];

function ss_() {
  if (SS_) return SS_;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  SS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_) throw new Error('The database Sheet is not connected yet. Run setup() from the script editor.');
  return SS_;
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase();
}

/**
 * Runs fn while holding the script-wide lock. Safe to nest. Cached reads are
 * dropped when the lock is first taken so decisions use fresh data.
 */
function withLock_(fn) {
  if (LOCK_DEPTH_ === 0) {
    LOCK_ = LockService.getScriptLock();
    try { LOCK_.waitLock(30000); }
    catch (e) { throw new Error('The system is busy. Please try again in a few seconds.'); }
    TCACHE_ = {};
    CONFIG_CACHE_ = null;
  }
  LOCK_DEPTH_++;
  try {
    return fn();
  } finally {
    // History lines written during this action are saved together, in one write.
    if (LOCK_DEPTH_ === 1 && LOG_BUFFER_.length) {
      var lines = LOG_BUFFER_;
      LOG_BUFFER_ = [];
      try { insert_('ActivityLog', lines); } catch (e) { console.error('ActivityLog write failed: ' + e); }
    }
    LOCK_DEPTH_--;
    if (LOCK_DEPTH_ === 0) {
      SpreadsheetApp.flush();
      LOCK_.releaseLock();
    }
  }
}

/** Reads a whole tab once per request: {sheet, headers, rows:[{_row, header: value}]}. */
function table_(name) {
  if (TCACHE_[name]) return TCACHE_[name];
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('The "' + name + '" tab is missing. Run setup() from the script editor.');
  var values = sh.getDataRange().getDisplayValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var o = { _row: i + 1 }, empty = true;
    for (var j = 0; j < headers.length; j++) {
      if (!headers[j]) continue;
      var v = unsafeCell_(values[i][j]);
      o[headers[j]] = v;
      if (v !== '') empty = false;
    }
    if (!empty) rows.push(o);
  }
  TCACHE_[name] = { sheet: sh, headers: headers, rows: rows };
  return TCACHE_[name];
}

function rows_(name) { return table_(name).rows; }

function find_(name, field, value) {
  var v = String(value);
  if (!TCACHE_[name]) {
    var quick = findRowFast_(name, field, v);
    if (quick !== undefined) return quick;
  }
  var rows = rows_(name);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][field]) === v) return rows[i];
  return null;
}

/**
 * Finds one row by an exact value without reading the whole tab: Sheets
 * searches the column itself and only the matching row is read. With 1,500
 * students this is the difference between reading 50,000 cells and reading 40.
 * Returns the row, null if there is none, or undefined if the quick way cannot
 * be used (the caller then reads the tab the ordinary way).
 */
function findRowFast_(name, field, v) {
  try {
    if (v === '' || /^[=+\-@']/.test(v)) return undefined;
    var h = head_(name), col = h.headers.indexOf(field);
    if (col < 0) return undefined;
    var sh = h.sheet, last = sh.getLastRow();
    if (last < 2) return null;
    var cells = sh.getRange(2, col + 1, last - 1, 1).createTextFinder(v).matchEntireCell(true).matchCase(true).findAll();
    for (var i = 0; i < cells.length; i++) {
      var rowNumber = cells[i].getRow();
      var values = sh.getRange(rowNumber, 1, 1, h.headers.length).getDisplayValues()[0];
      var o = { _row: rowNumber };
      for (var j = 0; j < h.headers.length; j++) if (h.headers[j]) o[h.headers[j]] = unsafeCell_(values[j]);
      if (String(o[field]) === v) return o;
    }
    return null;
  } catch (e) {
    return undefined;
  }
}

function filter_(name, field, value) {
  var v = String(value);
  return rows_(name).filter(function (r) { return String(r[field]) === v; });
}

function toRowArray_(headers, obj) {
  return headers.map(function (h) { return h ? safeCell_(obj[h]) : ''; });
}

/** Sheet + header row only (no data). Headers do not change during a request. */
function head_(name) {
  if (TCACHE_[name]) return TCACHE_[name];
  if (HCACHE_[name]) return HCACHE_[name];
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('The "' + name + '" tab is missing. Run setup() from the script editor.');
  var headers = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0]
    .map(function (h) { return String(h).trim(); });
  HCACHE_[name] = { sheet: sh, headers: headers };
  return HCACHE_[name];
}

/**
 * Appends rows (array of objects) to a tab in one write. Reads only the header
 * row, so writing a log line stays fast when the ActivityLog is very long.
 */
function insert_(name, objs) {
  if (!objs || !objs.length) return;
  withLock_(function () {
    var t = head_(name), sh = t.sheet;
    var start = sh.getLastRow() + 1;
    var need = start + objs.length - 1 - sh.getMaxRows();
    if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
    var values = objs.map(function (o) { return toRowArray_(t.headers, o); });
    sh.getRange(start, 1, values.length, t.headers.length).setNumberFormat('@').setValues(values);
    delete TCACHE_[name];
  });
}

/**
 * Updates one row found by key. Re-reads under the lock and writes back only
 * that row, merged with `changes`. Returns the updated row object.
 */
function update_(name, keyField, keyValue, changes) {
  return withLock_(function () {
    var t = table_(name);
    var row = find_(name, keyField, keyValue);
    if (!row) throw new Error('Record not found in ' + name + ': ' + keyValue);
    Object.keys(changes).forEach(function (k) {
      if (t.headers.indexOf(k) < 0) throw new Error('Column "' + k + '" is missing in the ' + name + ' tab. Run setup().');
      row[k] = String(changes[k] === null || changes[k] === undefined ? '' : changes[k]);
    });
    t.sheet.getRange(row._row, 1, 1, t.headers.length).setNumberFormat('@')
      .setValues([toRowArray_(t.headers, row)]);
    return row;
  });
}

/** Writes many changed row objects (already taken from table_ under the lock) in one go. */
function updateMany_(name, changedRows) {
  if (!changedRows.length) return;
  withLock_(function () {
    var t = table_(name), sh = t.sheet;
    var last = sh.getLastRow();
    if (last < 2) return;
    var range = sh.getRange(2, 1, last - 1, t.headers.length);
    var values = range.getDisplayValues();
    changedRows.forEach(function (row) { values[row._row - 2] = toRowArray_(t.headers, row); });
    values = values.map(function (r) { return r.map(function (c) { return safeCell_(unsafeCell_(c)); }); });
    range.setNumberFormat('@').setValues(values);
    delete TCACHE_[name];
  });
}

/** Replaces every data row of a tab (used for the small MailQueue tab only). */
function replaceAll_(name, objs) {
  withLock_(function () {
    var t = table_(name), sh = t.sheet;
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, t.headers.length).clearContent();
    delete TCACHE_[name];
    insert_(name, objs);
  });
}

/** Adds one line to the ActivityLog. Never throws: logging must not block real work. */
function log_(studentId, action, details, userEmail) {
  try {
    var line = {
      timestamp: now_(),
      user_email: userEmail === undefined ? currentEmail_() : userEmail,
      student_id: studentId || '',
      action: action,
      details: clean_(details, 1000)
    };
    if (LOCK_DEPTH_ > 0) LOG_BUFFER_.push(line);   // saved with the others when the action finishes
    else insert_('ActivityLog', [line]);
  } catch (e) {
    console.error('ActivityLog write failed: ' + e);
  }
}
