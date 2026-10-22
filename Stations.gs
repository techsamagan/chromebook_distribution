/**
 * Stations.gs — deployment-day station screens (all staff roles).
 *
 * Everything returned here is the trimmed "station view": name, grade, form
 * status and asset tag only. No parent contact, signatures or PDFs, because
 * Station Helpers (volunteers) use these functions.
 */

function stationView_(s, cfg, staff) {
  var r = readiness_(s, cfg);
  return {
    id: s.student_id, first: s.first_name, last: s.last_name, grade: s.grade, stage: s.stage,
    ready: r.ready, missing: r.missing, status: statusOf_(s, cfg), step: nextStep_(s, cfg),
    dpWaiting: s.dp_status === 'Signed' && !formOk_(s.dp_status, cfg), vzWaiting: s.vz_status === 'Signed' && !formOk_(s.vz_status, cfg),
    signed: !!s.signed_date, dpOk: formOk_(s.dp_status, cfg), vzOk: formOk_(s.vz_status, cfg),
    vzRequired: cfg.VERIZON_REQUIRED === 'Y',
    station1: !!s.station1_date, tag: s.asset_tag, working: !!s.working_date,
    canVerifyForms: staff.role !== ROLE_HELPER || cfg.HELPERS_CAN_VERIFY_FORMS === 'Y',
    canSignNow: s.link_active === 'Y'
  };
}

/** Search by name (or exact student ID). Returns at most 25 matches. */
function apiStationSearch(query) {
  var staff = requireRole_(ROLES_ALL);
  var cfg = getConfig_();
  var q = clean_(query, 60).toLowerCase();
  if (q.length < 2) return [];
  var words = q.split(/\s+/);
  var out = [];
  var rows = rows_('Students');
  for (var i = 0; i < rows.length && out.length < 25; i++) {
    var s = rows[i];
    var hay = (s.first_name + ' ' + s.last_name).toLowerCase();
    var hit = s.student_id.toLowerCase() === q || words.every(function (w) { return hay.indexOf(w) >= 0; });
    if (hit) out.push(stationView_(s, cfg, staff));
  }
  return out;
}

function apiStationGet(studentId) {
  var staff = requireRole_(ROLES_ALL);
  return stationView_(getStudent_(studentId), getConfig_(), staff);
}

/** Station 1: forms verified, send the student to Station 2. */
function apiStation1Verify(studentId) {
  var staff = requireRole_(ROLES_ALL);
  var cfg = getConfig_();
  withLock_(function () {
    var s = getStudent_(studentId);
    var r = readiness_(s, cfg);
    if (!r.ready) throw new Error('NOT READY: ' + r.missing.join('; '));
    if (!s.station1_date) update_('Students', 'student_id', s.student_id, { station1_date: now_() });
    setStage_(s.student_id, 'Verified at Station 1', 'Forms verified by ' + staff.name);
  });
  return apiStationGet(studentId);
}

/** Station 1 "Sign now": the student's own signing link, to open on the kiosk tablet. */
function apiStationSignLink(studentId) {
  requireRole_(ROLES_ALL);
  var s = getStudent_(studentId);
  if (s.link_active !== 'Y') throw new Error('The agreement is already signed for this student.');
  var link = linkFor_(s.code);
  if (!link) throw new Error('Ask an Admin to set PARENT_APP_URL in Settings.');
  log_(s.student_id, 'Sign-now link opened at station', '');
  return { link: link };
}

/**
 * Station 2: assign a Chromebook.
 * Rules enforced here, on the server: forms complete; the tag exists; the
 * device is in stock; one device per student; one student per device.
 * A check-out record PDF is saved in the student's folder.
 * Replacing a student's device needs confirmReplace=true and IT/Admin.
 */
async function apiAssignDevice(studentId, tagInput, confirmReplace) {
  var staff = requireRole_(ROLES_ALL);
  var cfg = getConfig_();
  var tag = clean_(tagInput, 60);
  if (!tag) throw new Error('Scan or type the asset tag.');
  var result = withLock_(function () {
    var s = getStudent_(studentId);
    var r = readiness_(s, cfg);
    if (!r.ready) throw new Error('NOT READY. Do not issue a Chromebook. ' + r.missing.join('; '));
    var d = findDevice_(tag);
    if (!d) throw new Error('Asset tag "' + tag + '" is not in the Devices list. Check the tag or ask IT.');
    if (s.asset_tag === d.asset_tag && d.assigned_student === s.student_id) return { already: true, tag: d.asset_tag };
    if (d.assigned_student) throw new Error('STOP: device ' + d.asset_tag + ' is already assigned to another student. Ask IT.');
    if (d.status !== 'In stock') throw new Error('Device ' + d.asset_tag + ' is marked "' + d.status + '" and cannot be assigned. Ask IT.');
    if (s.asset_tag) {
      if (staff.role === ROLE_HELPER) {
        throw new Error('STOP: this student already has Chromebook ' + s.asset_tag + '. Ask IT staff to replace it.');
      }
      if (!confirmReplace) {
        return { needsConfirm: true, message: 'This student already has Chromebook ' + s.asset_tag + '. Replace it with ' + d.asset_tag + '? The old one goes back to "In stock".' };
      }
      releaseDevice_(s, 'Replaced by ' + d.asset_tag);
    }
    var ts = now_();
    update_('Devices', 'asset_tag', d.asset_tag, { status: 'Assigned', assigned_student: s.student_id, date_assigned: ts });
    insert_('Checkouts', [{
      checkout_id: newId_('CO'), student_id: s.student_id, asset_tag: d.asset_tag, staff_email: staff.email,
      checked_out_at: ts, station: 'Station 2', type: 'Assigned', due: '', returned_date: '', asset_tiger_date: ''
    }]);
    update_('Students', 'student_id', s.student_id, { asset_tag: d.asset_tag, working_date: '' });
    setStage_(s.student_id, 'Chromebook assigned', 'Asset tag ' + d.asset_tag + ' by ' + staff.name +
      (s.station1_date ? '' : ' (Station 1 was not marked)'), true);
    return { assigned: true, tag: d.asset_tag };
  });
  if (result.assigned) {
    // The family's signed agreement is left untouched. The hand-over gets its own record.
    try { await generateCheckoutRecord_(studentId); }
    catch (e) {
      result.pdfWarning = 'The Chromebook is assigned, but the check-out record could not be saved. IT can open the student and choose "Make the PDFs again".';
      log_(studentId, 'Check-out record failed', e.message);
    }
  }
  result.student = apiStationGet(studentId);
  return result;
}

/** Finds a device by asset tag, or by serial number as a fallback (case-insensitive). */
function findDevice_(tag) {
  var t = String(tag).toLowerCase().trim();
  var rows = rows_('Devices'), bySerial = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].asset_tag).toLowerCase() === t) return rows[i];
    if (String(rows[i].serial_number).toLowerCase() === t) bySerial = rows[i];
  }
  return bySerial;
}

/** Closes the student's open checkout and puts the device back in stock. Call under the lock. */
function releaseDevice_(s, reason) {
  var ts = now_();
  filter_('Checkouts', 'student_id', s.student_id).forEach(function (c) {
    if (c.type === 'Assigned' && !c.returned_date) update_('Checkouts', 'checkout_id', c.checkout_id, { returned_date: ts });
  });
  var d = find_('Devices', 'asset_tag', s.asset_tag);
  if (d && d.assigned_student === s.student_id) {
    update_('Devices', 'asset_tag', d.asset_tag, {
      status: d.status === 'Lost' || d.status === 'Retired' ? d.status : 'In stock', assigned_student: '', date_assigned: ''
    });
  }
  log_(s.student_id, 'Device released', s.asset_tag + ': ' + reason);
}

/** Station 3: the student logged in and the device works — or there is a problem for IT. */
function apiVerifyWorking(studentId, ok, note) {
  var staff = requireRole_(ROLES_ALL);
  note = clean_(note, 500);
  var s = getStudent_(studentId);
  if (!s.asset_tag) throw new Error('This student has no Chromebook assigned yet.');
  if (ok) {
    if (!s.working_date) update_('Students', 'student_id', s.student_id, { working_date: now_() });
    setStage_(s.student_id, 'Verified working', 'Student logged in on ' + s.asset_tag + '. Checked by ' + staff.name);
  } else {
    if (!note) throw new Error('Please describe the problem.');
    log_(s.student_id, 'Problem at the sign-in check', s.asset_tag + ': ' + note);
    notifyIt_('Deployment day problem with ' + s.asset_tag,
      'Student: ' + s.first_name + ' ' + s.last_name + ' (grade ' + s.grade + ')\nAsset tag: ' + s.asset_tag +
      '\nReported by: ' + staff.name + '\n\n' + note);
  }
  return apiStationGet(studentId);
}
