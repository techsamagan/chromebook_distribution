/**
 * Devices.gs — device inventory, device import, Asset Tiger export,
 * inventory report.
 */

function deviceView_(d) {
  return d ? stripRow_(d) : null;
}

function apiListDevices() {
  requireRole_(ROLES_IT);
  return rows_('Devices').map(deviceView_);
}

/* ---------------- Device import (Admin) ---------------- */

function apiDeviceImportPreview(text) {
  requireRole_(ROLES_ADMIN);
  return deviceImportAnalyze_(text);
}

function deviceImportAnalyze_(text) {
  if (String(text || '').length > 3000000) throw new Error('The file is too large (limit about 3 MB).');
  var cfg = getConfig_();
  var parsed = parseDelimited_(text);
  if (parsed.records.length > 5000) throw new Error('Too many rows (limit 5000 per import).');
  var hasTag = parsed.headers.some(function (h) { return DEVICE_ALIASES_.asset_tag.indexOf(h) >= 0; });
  var hasSerial = parsed.headers.some(function (h) { return DEVICE_ALIASES_.serial_number.indexOf(h) >= 0; });
  if (!hasTag || !hasSerial) {
    throw new Error('The file needs an "Asset Tag" column and a "Serial Number" column. If the Digital Promise file has no asset tags, add an asset_tag column first.');
  }
  var byTag = {}, bySerial = {};
  rows_('Devices').forEach(function (d) {
    byTag[d.asset_tag.toLowerCase()] = d;
    if (d.serial_number) bySerial[d.serial_number.toLowerCase()] = d;
  });
  var seenTag = {}, seenSerial = {};
  var fields = ['serial_number', 'model', 'imei', 'mac', 'mdn', 'iccid', 'notes'];
  return parsed.records.map(function (r) {
    var d = normalizeDevice_(r.data, cfg._models[0]);
    var problems = validateDevice_(d);
    var tagKey = d.asset_tag.toLowerCase(), serKey = d.serial_number.toLowerCase();
    if (tagKey && seenTag[tagKey]) problems.push('This asset tag appears more than once in the file');
    if (serKey && seenSerial[serKey]) problems.push('This serial number appears more than once in the file');
    seenTag[tagKey] = true;
    seenSerial[serKey] = true;
    var existing = byTag[tagKey];
    if (serKey && bySerial[serKey] && bySerial[serKey] !== existing) {
      problems.push('Serial number already belongs to asset tag ' + bySerial[serKey].asset_tag);
    }
    var item = { line: r.line, data: d, status: 'new', problems: problems, changes: [] };
    if (problems.length) item.status = 'problem';
    else if (existing) {
      fields.forEach(function (f) {
        if (d[f] && d[f] !== existing[f]) item.changes.push({ field: f, old: existing[f] || '', 'new': d[f] });
      });
      item.status = item.changes.length ? 'update' : 'same';
      item.data.asset_tag = existing.asset_tag;
    }
    return item;
  });
}

/** Adds new devices; updates details of approved existing ones. Never changes status or assignment. */
function apiDeviceImportCommit(text, approvedTags) {
  requireRole_(ROLES_ADMIN);
  var approved = {};
  (approvedTags || []).forEach(function (t) { approved[String(t)] = true; });
  var result = { added: 0, updated: 0, skipped: 0 };
  withLock_(function () {
    var items = deviceImportAnalyze_(text);
    var toAdd = [], toUpdate = [];
    items.forEach(function (it) {
      if (it.status === 'new') {
        var d = it.data;
        d.status = 'In stock';
        d.assigned_student = '';
        d.date_assigned = '';
        toAdd.push(d);
      } else if (it.status === 'update' && approved[it.data.asset_tag]) {
        var row = find_('Devices', 'asset_tag', it.data.asset_tag);
        it.changes.forEach(function (c) { row[c.field] = c['new']; });
        toUpdate.push(row);
      } else if (it.status !== 'same') result.skipped++;
    });
    updateMany_('Devices', toUpdate);
    insert_('Devices', toAdd);
    result.added = toAdd.length;
    result.updated = toUpdate.length;
  });
  log_('', 'Device import', result.added + ' added, ' + result.updated + ' updated, ' + result.skipped + ' skipped');
  return result;
}

/** Add one device, or edit an existing device's details, status or notes. */
function apiSaveDevice(data, isNew) {
  requireRole_(ROLES_ADMIN);
  data = data || {};
  var d = {
    asset_tag: clean_(data.asset_tag, 40), serial_number: clean_(data.serial_number, 60),
    model: clean_(data.model, 60), imei: clean_(data.imei, 60), mac: clean_(data.mac, 60),
    mdn: clean_(data.mdn, 60), iccid: clean_(data.iccid, 60), notes: clean_(data.notes, 300),
    status: clean_(data.status, 20) || 'In stock'
  };
  var problems = validateDevice_(d);
  if (DEVICE_STATUSES.indexOf(d.status) < 0) problems.push('Unknown status');
  if (problems.length) throw new Error(problems.join('. ') + '.');
  withLock_(function () {
    var existing = find_('Devices', 'asset_tag', d.asset_tag);
    if (isNew) {
      if (existing || findDevice_(d.asset_tag)) throw new Error('Asset tag ' + d.asset_tag + ' already exists.');
      if (d.status === 'Assigned') throw new Error('Use the deployment screen to give a Chromebook to a student.');
      d.assigned_student = '';
      d.date_assigned = '';
      insert_('Devices', [d]);
      log_('', 'Device added', d.asset_tag);
      return;
    }
    if (!existing) throw new Error('Device not found.');
    if (d.status !== existing.status) {
      if (d.status === 'Assigned' && !existing.assigned_student) throw new Error('Use the deployment screen to give a Chromebook to a student.');
      if (existing.assigned_student && (d.status === 'In stock' || d.status === 'Retired')) {
        throw new Error('This Chromebook is with student ' + existing.assigned_student + '. Open the student and choose "Chromebook returned" first.');
      }
    }
    var changes = [];
    ['serial_number', 'model', 'imei', 'mac', 'mdn', 'iccid', 'notes', 'status'].forEach(function (f) {
      if (String(existing[f] || '') !== d[f]) changes.push(f + ': "' + (existing[f] || '') + '" -> "' + d[f] + '"');
    });
    if (!changes.length) return;
    delete d.asset_tag;
    update_('Devices', 'asset_tag', existing.asset_tag, d);
    log_(existing.assigned_student || '', 'Device edited', existing.asset_tag + ': ' + changes.join('; '));
  });
  return true;
}

/* ---------------- Asset Tiger export (Admin) ---------------- */

/** CSV of check-outs that have not been entered in Asset Tiger yet. */
function apiAssetTigerExport() {
  requireRole_(ROLES_ADMIN);
  var cfg = getConfig_();
  var students = {}, devices = {}, staff = {};
  rows_('Students').forEach(function (s) { students[s.student_id] = s; });
  rows_('Devices').forEach(function (d) { devices[d.asset_tag] = d; });
  rows_('Staff').forEach(function (s) { staff[String(s.email).toLowerCase()] = s.name; });
  var ids = [], rows = [];
  rows_('Checkouts').forEach(function (c) {
    if (c.type !== 'Assigned' || c.returned_date || c.asset_tiger_date) return;
    var s = students[c.student_id];
    if (!s) return;
    ids.push(c.checkout_id);
    rows.push([
      c.asset_tag, (devices[c.asset_tag] || {}).serial_number || '', s.first_name + ' ' + s.last_name,
      s.student_id, s.grade, assetTigerGroup_(s.grade, cfg.AT_GROUP_ELEMENTARY, cfg.AT_GROUP_SECONDARY),
      String(c.checked_out_at).substring(0, 10), staff[c.staff_email] || c.staff_email
    ]);
  });
  log_('', 'Asset Tiger export', rows.length + ' check-out(s)');
  return {
    ids: ids, count: rows.length,
    csv: toCsv_(['Asset Tag ID', 'Serial No', 'Student Name', 'Student ID', 'Grade', 'Assign To',
      'Check-out Date', 'Checked Out By'], rows)
  };
}

/** After the CSV was imported into Asset Tiger: mark those check-outs as entered. */
function apiMarkAssetTiger(checkoutIds) {
  requireRole_(ROLES_ADMIN);
  var want = {};
  (checkoutIds || []).forEach(function (id) { want[String(id)] = true; });
  var n = 0;
  withLock_(function () {
    var ts = now_();
    var changed = rows_('Checkouts').filter(function (c) { return want[c.checkout_id] && !c.asset_tiger_date; });
    changed.forEach(function (c) { c.asset_tiger_date = ts; });
    updateMany_('Checkouts', changed);
    changed.forEach(function (c) { setStage_(c.student_id, 'Entered in Asset Tiger', c.asset_tag); });
    n = changed.length;
  });
  return { marked: n };
}

/* ---------------- Inventory report (VILS, twice a year) ---------------- */

function inventoryData_() {
  var counts = {};
  DEVICE_STATUSES.forEach(function (s) { counts[s] = 0; });
  var students = {};
  rows_('Students').forEach(function (s) { students[s.student_id] = s; });
  var headers = ['Asset Tag', 'Serial Number', 'Model', 'IMEI', 'MAC', 'MDN', 'ICCID', 'Status',
    'Assigned Student ID', 'Assigned Student', 'Grade', 'Date Assigned', 'Notes'];
  var rows = rows_('Devices').map(function (d) {
    counts[d.status] = (counts[d.status] || 0) + 1;
    var s = students[d.assigned_student];
    return [d.asset_tag, d.serial_number, d.model, d.imei, d.mac, d.mdn, d.iccid, d.status,
      d.assigned_student, s ? s.first_name + ' ' + s.last_name : '', s ? s.grade : '', d.date_assigned, d.notes];
  });
  return { counts: counts, headers: headers, rows: rows, total: rows.length };
}

function apiInventoryReport() {
  requireRole_(ROLES_IT);
  var inv = inventoryData_();
  log_('', 'Inventory report exported', inv.total + ' device(s)');
  return { counts: inv.counts, total: inv.total, csv: toCsv_(inv.headers, inv.rows) };
}

function apiInventoryPdf() {
  requireRole_(ROLES_IT);
  var cfg = getConfig_();
  var inv = inventoryData_();
  var td = 'border:1px solid #000;padding:2px 4px;font-size:8px;';
  var html = '<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:10px">' +
    '<h2 style="margin:0">' + esc_(cfg.SCHOOL_NAME) + ' – Chromebook Inventory Report</h2>' +
    '<p>' + esc_(cfg.CAMPUS) + ' · generated ' + esc_(now_()) + ' · ' + inv.total + ' devices</p>' +
    '<table style="border-collapse:collapse;margin-bottom:10px"><tr>' +
    Object.keys(inv.counts).map(function (k) { return '<th style="' + td + 'font-size:10px">' + esc_(k) + '</th>'; }).join('') + '</tr><tr>' +
    Object.keys(inv.counts).map(function (k) { return '<td style="' + td + 'font-size:10px;text-align:center">' + inv.counts[k] + '</td>'; }).join('') +
    '</tr></table><table style="border-collapse:collapse;width:100%"><tr>' +
    inv.headers.map(function (h) { return '<th style="' + td + 'background:#e6e6e6">' + esc_(h) + '</th>'; }).join('') + '</tr>' +
    inv.rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td style="' + td + '">' + esc_(c) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</table></body></html>';
  var blob = Utilities.newBlob(html, 'text/html', 'inventory.html').getAs('application/pdf');
  log_('', 'Inventory report exported (PDF)', inv.total + ' device(s)');
  return { name: 'Chromebook_Inventory_' + today_() + '.pdf', mime: 'application/pdf', base64: Utilities.base64Encode(blob.getBytes()) };
}
