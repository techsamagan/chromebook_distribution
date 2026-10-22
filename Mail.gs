/**
 * Mail.gs — invitations, reminders and receipts.
 *
 * Sending is always a deliberate Admin action. The browser sends small batches
 * and shows progress; when Gmail's daily limit is reached the rest is queued
 * and sent automatically the next morning.
 */

function emailsOf_(s) {
  var list = [];
  [s.parent1_email, s.parent2_email].forEach(function (e) {
    e = String(e || '').toLowerCase().trim();
    if (isEmail_(e) && list.indexOf(e) < 0) list.push(e);
  });
  return list;
}

function mailVars_(s, cfg, extra) {
  var v = {
    student_name: s.first_name + ' ' + s.last_name, student_first_name: s.first_name,
    grade: s.grade, link: linkFor_(s.code), school: cfg.SCHOOL_NAME, it_email: cfg.IT_EMAIL
  };
  Object.keys(extra || {}).forEach(function (k) { v[k] = extra[k]; });
  return v;
}

/** Plain text -> simple HTML email; the link becomes a large button. */
function htmlBody_(text, link) {
  var html = esc_(text).replace(/\n/g, '<br>');
  if (link) {
    var button = '<br><a href="' + esc_(link) + '" style="display:inline-block;background:#12305b;color:#ffffff;' +
      'padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">' +
      'Sign the agreement / Firmar el acuerdo</a><br><span style="font-size:12px;color:#555555">' + esc_(link) + '</span>';
    html = html.split(esc_(link)).join(button);
  }
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222222">' + html + '</div>';
}

function inviteMessage_(s, cfg, kind) {
  var lang = s.language === 'es' ? 'ES' : 'EN';
  var K = kind === 'reminder' ? 'REMINDER' : 'INVITE';
  var vars = mailVars_(s, cfg);
  var body = fillTemplate_(cfg['EMAIL_' + K + '_BODY_' + lang], vars);
  return {
    subject: fillTemplate_(cfg['EMAIL_' + K + '_SUBJECT_' + lang], vars),
    body: body, html: htmlBody_(body, vars.link)
  };
}

/**
 * Sends the invitation (first time) or a reminder (after that) to both parent
 * emails. Returns 'sent', or the reason it was skipped.
 */
function sendToStudent_(studentId, cfg) {
  var s = getStudent_(studentId);
  if (s.link_active !== 'Y') return s.signed_date ? 'already signed' : 'link disabled';
  var to = emailsOf_(s);
  if (!to.length) return 'no email';
  var kind = s.invite_first_sent ? 'reminder' : 'invite';
  var msg = inviteMessage_(s, cfg, kind);
  MailApp.sendEmail({
    to: to.join(','), subject: msg.subject, body: msg.body, htmlBody: msg.html,
    name: cfg.SCHOOL_NAME, replyTo: cfg.IT_EMAIL
  });
  var ts = now_();
  var patch = { last_sent: ts };
  if (kind === 'invite') patch.invite_first_sent = ts;
  else patch.reminders_count = String((parseInt(s.reminders_count, 10) || 0) + 1);
  update_('Students', 'student_id', s.student_id, patch);
  if (kind === 'invite') setStage_(s.student_id, 'Invited', 'Invitation emailed to ' + to.length + ' address(es)');
  else log_(s.student_id, 'Reminder sent', 'Reminder #' + patch.reminders_count + ' to ' + to.length + ' address(es)');
  return 'sent';
}

/**
 * kind: 'invite' (everyone not yet invited), 'reminder' (invited, not signed)
 * or 'selected' (the given IDs). Returns who would get an email, plus a preview.
 */
function apiSendPreview(kind, ids) {
  requireRole_(ROLES_ADMIN);
  var cfg = getConfig_();
  if (!cfg.PARENT_APP_URL) throw new Error('Set PARENT_APP_URL in Settings before sending links.');
  var wanted = null;
  if (kind === 'selected') {
    wanted = {};
    (ids || []).forEach(function (id) { wanted[String(id)] = true; });
  }
  var targets = [], noEmail = [], signed = 0, sample = null;
  rows_('Students').forEach(function (s) {
    if (wanted && !wanted[s.student_id]) return;
    if (!wanted && kind === 'invite' && s.invite_first_sent) return;
    if (!wanted && kind === 'reminder' && !s.invite_first_sent) return;
    if (s.link_active !== 'Y') { if (wanted) signed++; return; }
    if (!emailsOf_(s).length) { noEmail.push(s.student_id); return; }
    targets.push(s.student_id);
    if (!sample) sample = s;
  });
  var preview = null;
  if (sample) {
    var m = inviteMessage_(sample, cfg, sample.invite_first_sent ? 'reminder' : 'invite');
    preview = { to: emailsOf_(sample).join(', '), subject: m.subject, body: m.body };
  }
  return {
    ids: targets, noEmail: noEmail.length, alreadySigned: signed, preview: preview,
    quota: MailApp.getRemainingDailyQuota(), batchSize: Math.max(1, parseInt(cfg.MAIL_BATCH_SIZE, 10) || 10)
  };
}

/** Sends one small batch. The browser calls this repeatedly and shows progress. */
function apiSendBatch(ids) {
  requireRole_(ROLES_ADMIN);
  var cfg = getConfig_();
  ids = (ids || []).slice(0, 50).map(String);
  var out = { sent: 0, skipped: [], notSent: [], quotaReached: false };
  for (var i = 0; i < ids.length; i++) {
    if (MailApp.getRemainingDailyQuota() < 2) {
      out.quotaReached = true;
      out.notSent = ids.slice(i);
      break;
    }
    try {
      var r = sendToStudent_(ids[i], cfg);
      if (r === 'sent') out.sent++;
      else out.skipped.push(ids[i] + ' (' + r + ')');
    } catch (e) {
      if (/limit|quota|too many/i.test(String(e.message))) {
        out.quotaReached = true;
        out.notSent = ids.slice(i);
        break;
      }
      out.skipped.push(ids[i] + ' (' + e.message + ')');
      log_(ids[i], 'Email failed', e.message);
    }
  }
  return out;
}

/** Saves the students that could not be emailed today and schedules the daily resume. */
function apiQueueSends(ids) {
  var me = requireRole_(ROLES_ADMIN);
  var ts = now_();
  withLock_(function () {
    var queued = {};
    rows_('MailQueue').forEach(function (q) { queued[q.student_id] = true; });
    var add = (ids || []).map(String).filter(function (id) { return !queued[id]; }).map(function (id) {
      return { student_id: id, kind: 'send', queued_at: ts, queued_by: me.email };
    });
    insert_('MailQueue', add);
  });
  ensureResumeTrigger_();
  var n = rows_('MailQueue').length;
  log_('', 'Emails queued', n + ' waiting for the daily Gmail limit to reset');
  return { queued: n };
}

function apiQueueStatus() {
  requireRole_(ROLES_ADMIN);
  return { queued: rows_('MailQueue').length, quota: MailApp.getRemainingDailyQuota() };
}

function apiClearQueue() {
  requireRole_(ROLES_ADMIN);
  replaceAll_('MailQueue', []);
  removeResumeTrigger_();
  log_('', 'Email queue cleared', '');
  return { queued: 0 };
}

function ensureResumeTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'resumeQueuedSends';
  });
  if (!exists) ScriptApp.newTrigger('resumeQueuedSends').timeBased().everyDays(1).atHour(7).create();
}

function removeResumeTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'resumeQueuedSends') ScriptApp.deleteTrigger(t);
  });
}

/**
 * Runs every morning (time trigger) while the queue is not empty. The trigger
 * belongs to the account that deployed the app and sends as that account.
 */
function resumeQueuedSends(e) {
  // A time trigger has no signed-in user, so recognise it by its trigger ID.
  // Any other caller (for example a browser) must be an Admin.
  var fromTrigger = !!(e && e.triggerUid) && ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'resumeQueuedSends' && String(t.getUniqueId()) === String(e.triggerUid);
  });
  if (!fromTrigger) requireRole_(ROLES_ADMIN);
  var cfg = getConfig_();
  var started = new Date().getTime();
  var queue = rows_('MailQueue').map(function (q) { return q.student_id; });
  var left = [], sent = 0;
  for (var i = 0; i < queue.length; i++) {
    if (MailApp.getRemainingDailyQuota() < 2 || new Date().getTime() - started > 240000) {
      left = queue.slice(i);
      break;
    }
    try { if (sendToStudent_(queue[i], cfg) === 'sent') sent++; }
    catch (e) {
      if (/limit|quota|too many/i.test(String(e.message))) { left = queue.slice(i); break; }
      log_(queue[i], 'Email failed', e.message);
    }
  }
  var ts = now_();
  replaceAll_('MailQueue', left.map(function (id) {
    return { student_id: id, kind: 'send', queued_at: ts, queued_by: 'auto-resume' };
  }));
  if (!left.length) removeResumeTrigger_();
  log_('', 'Queued emails sent', sent + ' sent, ' + left.length + ' still waiting', fromTrigger ? 'auto-resume' : undefined);
}

/** Emails the signed PDFs to the parent who signed. Returns true if sent. */
function sendReceipt_(s, pdfBlobs, cfg) {
  if (!isEmail_(s.signer_email) || MailApp.getRemainingDailyQuota() < 1) return false;
  var lang = s.language === 'es' ? 'ES' : 'EN';
  var vars = mailVars_(s, cfg, { parent_name: s.signer_name, signed_date: s.signed_date });
  var body = fillTemplate_(cfg['EMAIL_RECEIPT_BODY_' + lang], vars);
  MailApp.sendEmail({
    to: s.signer_email, subject: fillTemplate_(cfg['EMAIL_RECEIPT_SUBJECT_' + lang], vars),
    body: body, htmlBody: htmlBody_(body, ''), attachments: pdfBlobs,
    name: cfg.SCHOOL_NAME, replyTo: cfg.IT_EMAIL
  });
  return true;
}

/** Internal notice to the IT help address. Never throws. */
function notifyIt_(subject, body) {
  try {
    var cfg = getConfig_();
    if (isEmail_(cfg.IT_EMAIL) && MailApp.getRemainingDailyQuota() > 0) {
      MailApp.sendEmail({ to: cfg.IT_EMAIL, subject: '[Chromebook App] ' + subject, body: body });
    }
  } catch (e) { console.error('notifyIt_ failed: ' + e); }
}
