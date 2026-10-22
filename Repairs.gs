/**
 * Repairs.gs — after deployment: repair requests, lost/stolen reports,
 * the repair log with cost sharing, loaners, and returns.
 */

function repairView_(r) {
  return stripRow_(r);
}

function isOpenRepair_(r) {
  return r.status !== 'Closed' && r.status !== 'Cancelled';
}

/**
 * After a repair or loaner ends, puts the student back on the right stage.
 * Call under the lock.
 */
function restoreStage_(studentId) {
  var s = getStudent_(studentId);
  var repairs = filter_('Repairs', 'student_id', s.student_id).filter(isOpenRepair_);
  var lost = repairs.filter(function (r) { return r.type !== 'repair'; });
  var checkouts = filter_('Checkouts', 'student_id', s.student_id);
  var loanerOut = checkouts.some(function (c) { return c.type === 'Loaner' && !c.returned_date; });
  var stage;
  if (lost.length) stage = 'Lost/Stolen reported';
  else if (loanerOut) stage = 'Loaner issued';
  else if (repairs.length) stage = 'Repair open';
  else if (s.asset_tag) {
    var inAt = checkouts.some(function (c) {
      return c.type === 'Assigned' && !c.returned_date && c.asset_tag === s.asset_tag && c.asset_tiger_date;
    });
    stage = inAt ? 'Entered in Asset Tiger' : (s.working_date ? 'Verified working' : 'Chromebook assigned');
  } else return;
  if (s.stage !== stage) setStage_(s.student_id, stage, 'Status restored', true);
}

/** Creates a repair / lost / stolen record linked to the student and device. */
function createRepair_(studentId, type, description, reporter, assetTagOverride) {
  var cfg = getConfig_();
  if (REPAIR_TYPES.indexOf(type) < 0) throw new Error('Choose repair, lost or stolen.');
  description = clean_(description, 1000);
  if (description.length < 3) throw new Error('Please describe the problem.');
  var created = withLock_(function () {
    var s = getStudent_(studentId);
    var d = assetTagOverride ? findDevice_(assetTagOverride) : (s.asset_tag ? find_('Devices', 'asset_tag', s.asset_tag) : null);
    if (assetTagOverride && !d) throw new Error('Asset tag "' + assetTagOverride + '" is not in the Devices list.');
    if (!d) throw new Error('This student has no Chromebook assigned.');
    var mine = filter_('Repairs', 'student_id', s.student_id);
    if (type !== 'repair' && mine.some(function (r) { return r.type !== 'repair' && isOpenRepair_(r) && r.asset_tag === d.asset_tag; })) {
      throw new Error('A lost/stolen report is already open for this device.');
    }
    var row = {
      repair_id: newId_('R'), student_id: s.student_id, asset_tag: d.asset_tag,
      serial_number: d.serial_number, mdn: d.mdn, imei: d.imei, iccid: d.iccid, mac: d.mac,
      type: type, description: description, repair: '', replacement: '', cost: '',
      repair_number: '', school_share: '', student_share: '', status: 'Open',
      opened_date: now_(), closed_date: '', reported_by: reporter, paid: ''
    };
    if (type === 'repair') {
      row.repair_number = String(mine.filter(function (r) { return r.type === 'repair' && r.status !== 'Cancelled'; }).length + 1);
    } else {
      var full = cfg._costs.filter(function (c) { return /replacement/i.test(c.name); })[0];
      // The price column of this Chromebook's model, when the model is one of those in Settings.
      var col = Math.max(0, cfg._models.indexOf(d.model));
      if (full) { row.replacement = full.name; row.cost = (full.costs[col] || full.cost).toFixed(2); }
      if (d.status !== 'Retired') update_('Devices', 'asset_tag', d.asset_tag, { status: 'Lost' });
    }
    insert_('Repairs', [row]);
    setStage_(s.student_id, type === 'repair' ? 'Repair open' : 'Lost/Stolen reported',
      row.repair_id + ' (' + type + ') ' + d.asset_tag + ': ' + description, true, reporter);
    return { row: row, student: s };
  });
  notifyIt_((type === 'repair' ? 'Repair request' : 'LOST/STOLEN report') + ' – ' + created.row.asset_tag,
    'Student: ' + created.student.first_name + ' ' + created.student.last_name + ' (grade ' + created.student.grade +
    ', ID ' + created.student.student_id + ')\nAsset tag: ' + created.row.asset_tag + '\nReported by: ' + reporter +
    '\nRecord: ' + created.row.repair_id + '\n\n' + description);
  return created.row;
}

function apiCreateRepair(data) {
  var staff = requireRole_(ROLES_IT);
  data = data || {};
  return repairView_(createRepair_(clean_(data.studentId, 30), clean_(data.type, 10), data.description,
    staff.email, clean_(data.assetTag, 60)));
}

/**
 * Student-facing forms (?page=repair, ?page=lost). The student must be signed
 * in to a school account and give their student ID and last name.
 */
function apiStudentReport(data) {
  var email = requireDomainUser_();
  data = data || {};
  if (!rateLimit_('report:' + email, 5, 3600)) throw new Error('Too many reports. Please see IT staff.');
  var id = clean_(data.studentId, 30), last = clean_(data.lastName, 60).toLowerCase();
  var s = id ? find_('Students', 'student_id', id) : null;
  if (!s || s.last_name.toLowerCase() !== last) throw new Error('We could not match that student ID and last name. Check them or see IT staff.');
  var row = createRepair_(s.student_id, clean_(data.type, 10), data.description, email, '');
  return { ok: true, id: row.repair_id };
}

function apiListRepairs() {
  requireRole_(ROLES_IT);
  var names = {};
  rows_('Students').forEach(function (s) { names[s.student_id] = s.first_name + ' ' + s.last_name + ' (gr. ' + s.grade + ')'; });
  var models = {};
  rows_('Devices').forEach(function (d) { models[d.asset_tag] = d.model; });
  return rows_('Repairs').map(function (r) {
    var v = repairView_(r);
    v.student_name = names[r.student_id] || r.student_id;
    v.model = models[r.asset_tag] || '';
    return v;
  }).reverse();
}

/**
 * Updates the repair log entry. For repairs, the school and student shares
 * are calculated from the cost and the student's repair number.
 */
function apiUpdateRepair(repairId, data) {
  requireRole_(ROLES_IT);
  var cfg = getConfig_();
  data = data || {};
  return withLock_(function () {
    var r = find_('Repairs', 'repair_id', clean_(repairId, 30));
    if (!r) throw new Error('Repair record not found.');
    var patch = {};
    if (data.repair !== undefined) patch.repair = clean_(data.repair, 500);
    if (data.replacement !== undefined) patch.replacement = clean_(data.replacement, 100);
    if (data.paid !== undefined) patch.paid = data.paid ? 'Y' : '';
    if (data.cost !== undefined) {
      var costStr = clean_(data.cost, 20).replace(/[$,\s]/g, '');
      if (costStr !== '' && !/^\d+(\.\d{1,2})?$/.test(costStr)) throw new Error('Cost must be a number, for example 59.00');
      patch.cost = costStr === '' ? '' : parseFloat(costStr).toFixed(2);
    }
    var cost = patch.cost !== undefined ? patch.cost : r.cost;
    if (r.type === 'repair') {
      if (cost !== '') {
        var share = costShare_(r.repair_number, cost, cfg._shares);
        patch.school_share = share.school;
        patch.student_share = share.student;
      } else { patch.school_share = ''; patch.student_share = ''; }
    } else {
      ['school_share', 'student_share'].forEach(function (f) {
        if (data[f] === undefined) return;
        var v = clean_(data[f], 20).replace(/[$,\s]/g, '');
        if (v !== '' && !/^\d+(\.\d{1,2})?$/.test(v)) throw new Error('Shares must be numbers.');
        patch[f] = v === '' ? '' : parseFloat(v).toFixed(2);
      });
    }
    var newStatus = data.status !== undefined ? clean_(data.status, 20) : r.status;
    if (REPAIR_STATUSES.indexOf(newStatus) < 0) throw new Error('Unknown status.');
    if (newStatus !== r.status) {
      patch.status = newStatus;
      var closing = newStatus === 'Closed' || newStatus === 'Cancelled';
      patch.closed_date = closing ? now_() : '';
      var d = find_('Devices', 'asset_tag', r.asset_tag);
      if (d && r.type === 'repair') {
        if (newStatus === 'In repair' && d.status === 'Assigned') update_('Devices', 'asset_tag', d.asset_tag, { status: 'In repair' });
        if (newStatus !== 'In repair' && d.status === 'In repair') {
          update_('Devices', 'asset_tag', d.asset_tag, { status: d.assigned_student ? 'Assigned' : 'In stock' });
        }
      }
      if (d && r.type !== 'repair' && newStatus === 'Cancelled' && d.status === 'Lost') {
        update_('Devices', 'asset_tag', d.asset_tag, { status: d.assigned_student ? 'Assigned' : 'In stock' });
      }
    }
    var changed = Object.keys(patch).filter(function (k) { return String(r[k] || '') !== String(patch[k]); });
    if (changed.length) {
      var summary = changed.map(function (k) { return k + ': "' + (r[k] || '') + '" -> "' + patch[k] + '"'; }).join('; ');
      update_('Repairs', 'repair_id', r.repair_id, patch);
      log_(r.student_id, 'Repair updated', r.repair_id + ': ' + summary);
      if (patch.status) restoreStage_(r.student_id);
    }
    return repairView_(find_('Repairs', 'repair_id', r.repair_id));
  });
}

/* ---------------- Loaners ---------------- */

function apiListLoaners() {
  requireRole_(ROLES_IT);
  var names = {};
  rows_('Students').forEach(function (s) { names[s.student_id] = s.first_name + ' ' + s.last_name + ' (gr. ' + s.grade + ')'; });
  var now = now_();
  var out = rows_('Checkouts').filter(function (c) { return c.type === 'Loaner' && !c.returned_date; }).map(function (c) {
    return {
      checkout_id: c.checkout_id, student_id: c.student_id, student_name: names[c.student_id] || c.student_id,
      asset_tag: c.asset_tag, checked_out_at: c.checked_out_at, due: c.due, overdue: !!c.due && c.due < now
    };
  });
  var available = rows_('Devices').filter(function (d) { return d.status === 'Loaner' && !d.assigned_student; })
    .map(function (d) { return d.asset_tag; });
  return { out: out, available: available };
}

/** Issues a loaner, due back at the end of the day (Config > LOANER_DUE_TIME). */
function apiIssueLoaner(studentId, tagInput) {
  var staff = requireRole_(ROLES_IT);
  var cfg = getConfig_();
  var tag = clean_(tagInput, 60);
  if (!tag) throw new Error('Scan or type the loaner asset tag.');
  withLock_(function () {
    var s = getStudent_(studentId);
    if (!s.signed_date) throw new Error('This student has no signed Chromebook agreement.');
    var d = findDevice_(tag);
    if (!d) throw new Error('Asset tag "' + tag + '" is not in the Devices list.');
    if (d.assigned_student) throw new Error('Device ' + d.asset_tag + ' is already with a student.');
    if (d.status !== 'Loaner' && d.status !== 'In stock') throw new Error('Device ' + d.asset_tag + ' is marked "' + d.status + '".');
    var open = filter_('Checkouts', 'student_id', s.student_id).some(function (c) { return c.type === 'Loaner' && !c.returned_date; });
    if (open) throw new Error('This student already has a loaner that was not returned.');
    var ts = now_();
    var dueTime = /^\d{1,2}:\d{2}$/.test(cfg.LOANER_DUE_TIME) ? cfg.LOANER_DUE_TIME : '16:00';
    if (dueTime.length === 4) dueTime = '0' + dueTime;
    update_('Devices', 'asset_tag', d.asset_tag, { status: 'Loaner', assigned_student: s.student_id, date_assigned: ts });
    insert_('Checkouts', [{
      checkout_id: newId_('LN'), student_id: s.student_id, asset_tag: d.asset_tag, staff_email: staff.email,
      checked_out_at: ts, station: 'IT desk', type: 'Loaner', due: today_() + ' ' + dueTime + ':00',
      returned_date: '', asset_tiger_date: ''
    }]);
    setStage_(s.student_id, 'Loaner issued', 'Loaner ' + d.asset_tag + ', due ' + dueTime + ' today', true);
  });
  return apiListLoaners();
}

function apiReturnLoaner(checkoutId) {
  requireRole_(ROLES_IT);
  withLock_(function () {
    var c = find_('Checkouts', 'checkout_id', clean_(checkoutId, 30));
    if (!c || c.type !== 'Loaner') throw new Error('Loaner record not found.');
    if (c.returned_date) return;
    update_('Checkouts', 'checkout_id', c.checkout_id, { returned_date: now_() });
    var d = find_('Devices', 'asset_tag', c.asset_tag);
    if (d && d.assigned_student === c.student_id) {
      update_('Devices', 'asset_tag', d.asset_tag, { status: 'Loaner', assigned_student: '', date_assigned: '' });
    }
    log_(c.student_id, 'Loaner returned', c.asset_tag);
    restoreStage_(c.student_id);
  });
  return apiListLoaners();
}

/* ---------------- Returns (withdraw, transfer, graduate) ---------------- */

function apiReturnDevice(studentId, note) {
  requireRole_(ROLES_IT);
  note = clean_(note, 300);
  withLock_(function () {
    var s = getStudent_(studentId);
    if (!s.asset_tag) throw new Error('This student has no Chromebook assigned.');
    var tag = s.asset_tag;
    releaseDevice_(s, 'Returned' + (note ? ': ' + note : ''));
    update_('Students', 'student_id', s.student_id, { asset_tag: '', working_date: '' });
    setStage_(s.student_id, 'Returned', tag + (note ? ': ' + note : ''), true);
  });
  return true;
}

function apiMarkNotReturned(studentId, note) {
  requireRole_(ROLES_IT);
  note = clean_(note, 300);
  withLock_(function () {
    var s = getStudent_(studentId);
    if (!s.asset_tag) throw new Error('This student has no Chromebook assigned.');
    setStage_(s.student_id, 'Not returned – records hold', s.asset_tag + (note ? ': ' + note : ''), true);
  });
  return true;
}
