/**
 * Setup.gs — one-time setup and sample data.
 *
 * Run setup() from the script editor (choose "setup" in the function list and
 * press Run). It is safe to run again: it only adds what is missing and never
 * deletes or overwrites data.
 */

function setup() {
  guardSetup_();
  var notes = [];
  var props = PropertiesService.getScriptProperties();
  var ss;
  var id = props.getProperty('SHEET_ID');
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      ss = SpreadsheetApp.create('ASE Chromebook App Database');
      notes.push('Created a new database Sheet: ' + ss.getUrl());
    }
    props.setProperty('SHEET_ID', ss.getId());
  }
  SS_ = ss;
  TCACHE_ = {};
  CONFIG_CACHE_ = null;

  // Tabs and header rows.
  Object.keys(TABLES).forEach(function (name) {
    var headers = TABLES[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      notes.push('Created tab ' + name);
    }
    var lastCol = sh.getLastColumn();
    var existing = lastCol ? sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); }) : [];
    var missing = headers.filter(function (h) { return existing.indexOf(h) < 0; });
    var total = existing.length + missing.length;
    if (sh.getMaxColumns() < total) sh.insertColumnsAfter(sh.getMaxColumns(), total - sh.getMaxColumns());
    if (missing.length) {
      sh.getRange(1, existing.length + 1, 1, missing.length).setNumberFormat('@').setValues([missing]);
      if (existing.length) notes.push('Added column(s) to ' + name + ': ' + missing.join(', '));
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), existing.length + missing.length).setNumberFormat('@');
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  // Default settings (existing values are kept).
  var have = {};
  rows_('Config').forEach(function (r) { have[r.key] = true; });
  var add = DEFAULT_CONFIG.filter(function (d) { return !have[d[0]]; })
    .map(function (d) { return { key: d[0], value: d[1], description: d[2] }; });
  insert_('Config', add);
  forgetCached_('config:v1');
  forgetCached_('staff:v1');
  if (add.length) notes.push('Added ' + add.length + ' default setting(s) to Config');
  CONFIG_CACHE_ = null;

  // First Admin = the account running setup.
  if (!rows_('Staff').length) {
    var me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    insert_('Staff', [{ email: me, name: 'IT Admin', role: ROLE_ADMIN, active: 'Y' }]);
    forgetCached_('staff:v1');
    notes.push('Added ' + me + ' to Staff as Admin');
  }

  // Drive folders.
  var cfg = getConfig_();
  if (!cfg.DRIVE_FOLDER_ID) {
    var folder = DriveApp.createFolder('ASE Chromebook App Files (move me to the Shared Drive)');
    setConfig_('DRIVE_FOLDER_ID', folder.getId());
    notes.push('WARNING: DRIVE_FOLDER_ID was empty, so a temporary folder was created in My Drive. ' +
      'Create a folder in the school Shared Drive and put its ID in Config > DRIVE_FOLDER_ID before going live.');
  }
  try {
    var year = yearFolder_(getConfig_());
    if (!getConfig_().DP_TEMPLATE_FILE_ID) notes.push('NEXT: upload the three blank PDF forms to Drive and put their IDs in Config (CHECKOUT_TEMPLATE_FILE_ID, DP_TEMPLATE_FILE_ID, VZ_TEMPLATE_FILE_ID), then run pdfSmokeTest().');
    notes.push('Drive folder ready: ' + year.getName());
  } catch (e) {
    notes.push('WARNING: could not open the Drive folder in Config > DRIVE_FOLDER_ID (' + e.message + ')');
  }

  var summary = 'Setup finished.\n' + notes.join('\n') + '\nDatabase Sheet: ' + ss.getUrl();
  console.log(summary);
  return summary;
}

/** After the first setup, only an Admin may run setup or load sample data. */
function guardSetup_() {
  var hasAdmin = false;
  try {
    hasAdmin = rows_('Staff').some(function (r) { return r.role === ROLE_ADMIN && r.active === 'Y'; });
  } catch (e) { hasAdmin = false; }
  if (hasAdmin) requireRole_(ROLES_ADMIN);
}

/**
 * Adds 10 fake students and 10 fake devices for testing. Run from the script
 * editor after setup(). All emails use example.com, so nothing reaches a real
 * family. Delete these rows from the Sheet before the real import.
 */
function loadSampleData() {
  requireRole_(ROLES_ADMIN);
  var students = [
    ['900001', 'Ava', 'Martinez', '5', '2015-03-14', 'Elena Martinez', 'elena.martinez@example.com', '505-555-0101', '', '', '', 'es'],
    ['900002', 'Liam', "O'Connor", '5', '2015-07-02', "Sean O'Connor", 'sean.oconnor@example.com', '505-555-0102', "Maeve O'Connor", 'maeve.oconnor@example.com', '505-555-0103', 'en'],
    ['900003', 'Noah', 'Begay', '6', '2014-11-23', 'Tina Begay', 'tina.begay@example.com', '505-555-0104', '', '', '', 'en'],
    ['900004', 'Sofia', 'Garcia-Lopez', '6', '2014-01-30', 'Maria Lopez', 'maria.lopez@example.com', '505-555-0105', 'Jorge Garcia', 'jorge.garcia@example.com', '', 'es'],
    ['900005', 'Ethan', 'Nguyen', '7', '2013-09-09', 'Linh Nguyen', 'linh.nguyen@example.com', '505-555-0106', '', '', '', 'en'],
    ['900006', 'Mia', 'Johnson', '7', '2013-05-18', 'Carla Johnson', '', '505-555-0107', '', '', '', 'en'],
    ['900007', 'Lucas', 'Chavez', '8', '2012-12-01', 'Rosa Chavez', 'rosa.chavez@example.com', '505-555-0108', '', '', '', 'es'],
    ['900008', 'Isabella', 'Kim', '9', '2011-08-27', 'Daniel Kim', 'daniel.kim@example.com', '505-555-0109', '', '', '', 'en'],
    ['900009', 'Mateo', 'Sanchez', '10', '2010-04-11', 'Luz Sanchez', 'luz.sanchez@example.com', '505-555-0110', '', '', '', 'es'],
    ['900010', 'Zoe', 'Williams', '12', '2008-10-05', 'Andre Williams', 'andre.williams@example.com', '505-555-0111', '', '', '', 'en']
  ];
  var fields = ['student_id', 'first_name', 'last_name', 'grade', 'dob', 'parent1_name', 'parent1_email',
    'parent1_phone', 'parent2_name', 'parent2_email', 'parent2_phone', 'language'];
  var cfg = getConfig_();
  var added = { students: 0, devices: 0 };
  withLock_(function () {
    var newStudents = [];
    students.forEach(function (row) {
      if (find_('Students', 'student_id', row[0])) return;
      var s = {};
      fields.forEach(function (f, i) { s[f] = row[i]; });
      newStudents.push(newStudentRow_(s));
    });
    insert_('Students', newStudents);
    added.students = newStudents.length;

    var newDevices = [];
    for (var i = 1; i <= 10; i++) {
      var n = (i < 10 ? '0' : '') + i;
      var tag = 'TEST-10' + n;
      if (find_('Devices', 'asset_tag', tag)) continue;
      newDevices.push({
        asset_tag: tag, serial_number: 'SNTEST0000' + n, model: cfg._models[0] || '',
        imei: '3500000000000' + n, mac: '00:1A:2B:3C:4D:' + n, mdn: '50555502' + n,
        iccid: '891480000000000000' + n, status: i === 10 ? 'Loaner' : 'In stock',
        assigned_student: '', date_assigned: '', notes: 'Sample device'
      });
    }
    insert_('Devices', newDevices);
    added.devices = newDevices.length;
  });
  log_('', 'Sample data loaded', added.students + ' students, ' + added.devices + ' devices');
  var msg = 'Added ' + added.students + ' sample students and ' + added.devices + ' sample devices.';
  console.log(msg);
  return msg;
}
