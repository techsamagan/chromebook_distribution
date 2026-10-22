/**
 * Auth.gs — who is calling, and what they may do.
 *
 * Staff are identified by their school Google account. The email is checked
 * against the Staff tab on EVERY server call; hiding a button in the browser
 * is never treated as security.
 */

function currentEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').toLowerCase().trim(); }
  catch (e) { return ''; }
}

/** Returns {email, name, role} for an active staff member, otherwise null. */
function currentStaff_() {
  var email = currentEmail_();
  if (!email) return null;
  var domain = String(getConfig_().ALLOWED_DOMAIN || '').toLowerCase().trim();
  if (domain && email.split('@')[1] !== domain) return null;
  var rows;
  try { rows = staffRows_(); } catch (e) { return null; }
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.email).toLowerCase().trim() === email && String(r.active).toUpperCase() === 'Y' &&
        ROLES_ALL.indexOf(r.role) >= 0) {
      return { email: email, name: r.name || email, role: r.role };
    }
  }
  return null;
}

/**
 * The Staff list, from Google's cache for up to a minute. Every server call
 * checks the caller against it, so this saves a Sheet read on every click.
 * Changes made in the app apply at once; a change typed straight into the
 * Staff tab takes up to a minute.
 */
function staffRows_() {
  var cache = CacheService.getScriptCache();
  try {
    var hit = cache.get('staff:v1');
    if (hit) return JSON.parse(hit);
  } catch (e) { /* read the Sheet instead */ }
  var rows = rows_('Staff').map(function (r) { return { email: r.email, name: r.name, role: r.role, active: r.active }; });
  try { cache.put('staff:v1', JSON.stringify(rows), 60); } catch (e) { /* no cache */ }
  return rows;
}

/** Throws unless the caller is active staff with one of the given roles. */
function requireRole_(roles) {
  var staff = currentStaff_();
  if (!staff || roles.indexOf(staff.role) < 0) {
    throw new Error('Access denied. Your account does not have permission for this action.');
  }
  return staff;
}

/** For the student repair / lost forms: any signed-in account on the school domain. */
function requireDomainUser_() {
  var email = currentEmail_();
  var domain = String(getConfig_().ALLOWED_DOMAIN || '').toLowerCase().trim();
  if (!email || !domain || email.split('@')[1] !== domain) {
    throw new Error('Please sign in with your school Google account.');
  }
  return email;
}

/** Simple counter in the script cache; returns true while under the limit. */
function rateLimit_(key, max, seconds) {
  var cache = CacheService.getScriptCache();
  var n = parseInt(cache.get('rl:' + key), 10) || 0;
  if (n >= max) return false;
  cache.put('rl:' + key, String(n + 1), seconds);
  return true;
}

/** Page bootstrap for the staff app. */
function apiBoot() {
  return bootData_(requireRole_(ROLES_ALL));
}

function bootData_(staff) {
  var cfg = getConfig_();
  var boot = {
    user: staff,
    school: cfg.SCHOOL_NAME, campus: cfg.CAMPUS, deploymentDate: cfg.DEPLOYMENT_DATE,
    gradeMin: +cfg.GRADE_MIN, gradeMax: +cfg.GRADE_MAX,
    verizonRequired: cfg.VERIZON_REQUIRED === 'Y',
    stages: STAGES.concat(POST_STAGES)
  };
  if (staff.role !== ROLE_HELPER) {
    boot.deviceStatuses = DEVICE_STATUSES;
    boot.formStatuses = FORM_STATUSES;
    boot.repairStatuses = REPAIR_STATUSES;
    boot.costs = cfg._costs;
    boot.models = cfg._models;
    boot.shares = cfg._shares;
    boot.outsideMethod = cfg.OUTSIDE_FORMS_METHOD;
    boot.importFields = STUDENT_IMPORT_FIELDS;
    boot.urlsConfigured = !!cfg.PARENT_APP_URL;
    boot.staffUrl = cfg.STAFF_APP_URL;
  }
  return boot;
}

/** Does nothing except check who is calling. Used by the speed test to time one bare trip to the server. */
function apiPing() {
  requireRole_(ROLES_ALL);
  return true;
}

/* ---------------- Staff management (Admin) ---------------- */

function apiListStaff() {
  requireRole_(ROLES_ADMIN);
  return rows_('Staff').map(function (r) {
    return { email: r.email, name: r.name, role: r.role, active: String(r.active).toUpperCase() === 'Y' };
  });
}

function apiSaveStaff(data) {
  var me = requireRole_(ROLES_ADMIN);
  data = data || {};
  var email = clean_(data.email, 120).toLowerCase();
  var name = clean_(data.name, 100);
  var role = clean_(data.role, 30);
  var active = data.active ? 'Y' : 'N';
  var domain = String(getConfig_().ALLOWED_DOMAIN || '').toLowerCase();
  if (!isEmail_(email)) throw new Error('Enter a valid email address.');
  if (domain && email.split('@')[1] !== domain) throw new Error('Staff accounts must be @' + domain + ' accounts.');
  if (ROLES_ALL.indexOf(role) < 0) throw new Error('Choose a role.');
  if (email === me.email && (role !== ROLE_ADMIN || active !== 'Y')) {
    throw new Error('You cannot remove your own Admin access. Ask another Admin.');
  }
  withLock_(function () {
    var existing = find_('Staff', 'email', email) ||
      rows_('Staff').filter(function (r) { return String(r.email).toLowerCase().trim() === email; })[0];
    if (existing) {
      update_('Staff', 'email', existing.email, { name: name, role: role, active: active });
      log_('', 'Staff updated', email + ': role ' + existing.role + ' -> ' + role + ', active ' + existing.active + ' -> ' + active);
    } else {
      insert_('Staff', [{ email: email, name: name, role: role, active: active }]);
      log_('', 'Staff added', email + ' as ' + role);
    }
  });
  forgetCached_('staff:v1');
  return apiListStaff();
}

/** Event-day switch: turn every Station Helper account on or off at once. */
function apiSetHelpersActive(active) {
  requireRole_(ROLES_ADMIN);
  var flag = active ? 'Y' : 'N';
  withLock_(function () {
    var changed = rows_('Staff').filter(function (r) { return r.role === ROLE_HELPER && r.active !== flag; });
    changed.forEach(function (r) { r.active = flag; });
    updateMany_('Staff', changed);
    log_('', 'Station Helpers switched ' + (active ? 'ON' : 'OFF'), changed.length + ' account(s)');
  });
  forgetCached_('staff:v1');
  return apiListStaff();
}

/* ---------------- Settings (Admin) ---------------- */

function apiGetSettings() {
  requireRole_(ROLES_ADMIN);
  return rows_('Config').map(function (r) { return { key: r.key, value: r.value, description: r.description }; });
}

function apiSaveSetting(key, value) {
  requireRole_(ROLES_ADMIN);
  saveSetting_(key, value);
  return apiGetSettings();
}

/** Saves several settings from one form: {KEY: value, ...}. Nothing is saved if one value is refused. */
function apiSaveSettings(values) {
  requireRole_(ROLES_ADMIN);
  values = values || {};
  var keys = Object.keys(values).slice(0, 100);
  keys.forEach(function (k) { checkSetting_(clean_(k, 80), values[k]); });
  keys.forEach(function (k) { saveSetting_(k, values[k]); });
  return apiGetSettings();
}

/** Throws a readable message if a value is not acceptable for that setting. Returns the cleaned value. */
function checkSetting_(key, value) {
  value = String(value === null || value === undefined ? '' : value).replace(/\r\n?/g, '\n').trim();
  if (!key) throw new Error('Missing setting name.');
  if (value.length > 5000) throw new Error('The text for ' + key + ' is too long.');
  if ((key === 'PARENT_APP_URL' || key === 'STAFF_APP_URL') && value && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(value)) {
    throw new Error('The web link must start with https://script.google.com/ and end with /exec');
  }
  if (key.indexOf('COST: ') === 0 && !/^\d+(\.\d{1,2})?(\s*\|\s*\d+(\.\d{1,2})?)*$/.test(value)) throw new Error('"' + key.substring(6) + '" needs a price such as 59.00');
  if (key.indexOf('SHARE: ') === 0 && !/^\d+\s*\/\s*\d+$/.test(value)) throw new Error('"' + key.substring(7) + '" needs two percentages such as 50/50');
  if (/_EMAIL$/.test(key) && value && !isEmail_(value)) throw new Error(key + ' must be an email address.');
  return value;
}

function saveSetting_(key, value) {
  key = clean_(key, 80);
  value = checkSetting_(key, value);
  var old = (find_('Config', 'key', key) || {}).value || '';
  if (old === value) return;
  setConfig_(key, value);
  log_('', 'Setting changed', key + ': "' + clean_(old, 200) + '" -> "' + clean_(value, 200) + '"');
  if (key === 'PARENT_APP_URL') rebuildLinks_();
}

/** Rewrites the stored link of every student after the parent URL changes. */
function rebuildLinks_() {
  withLock_(function () {
    var rows = rows_('Students');
    rows.forEach(function (s) { s.link = s.code ? linkFor_(s.code) : ''; });
    updateMany_('Students', rows);
  });
}
