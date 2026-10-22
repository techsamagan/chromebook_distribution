/**
 * End-to-end test of the server code against the in-memory mock:
 *   node tests/run-tests.js
 * Covers the full journey in docs/TEST-CHECKLIST.md plus the security rules.
 */
const assert = require('assert');
const zlib = require('zlib');
const { createEnv } = require('./gas-mock');

const env = createEnv();
const { state, call, internal, sheetRows } = env;
const ADMIN = 'it.admin@abqse.org', IT = 'tech@abqse.org', HELPER = 'volunteer@abqse.org';
let passed = 0;
const queue = [];
function section(name) { queue.push({ section: name }); }
function test(name, fn) { queue.push({ name, fn }); }
async function run() {
  for (const t of queue) {
    if (t.section) { console.log('\n' + t.section); continue; }
    try { await t.fn(); passed++; console.log('  ok  ' + t.name); }
    catch (e) { console.log('FAIL  ' + t.name + '\n      ' + (e.stack || e)); process.exitCode = 1; }
  }
  console.log('\n' + passed + ' passed' + (process.exitCode ? ', SOME FAILED' : ', 0 failed') + '\n');
}
async function rejects(fn, re) {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  assert.ok(err && re.test(err.message), 'expected error ' + re + ', got ' + (err ? err.message : 'no error'));
}
function throws(fn, re) { assert.throws(fn, (e) => re.test(e.message), 'expected error ' + re); }
const student = (id) => sheetRows('Students').find((s) => s.student_id === id);
const device = (tag) => sheetRows('Devices').find((d) => d.asset_tag === tag);

/** A real (tiny) PNG, as a canvas would produce. */
function png() {
  const w = 60, h = 20, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 251;
  for (let y = 0; y < h; y++) raw[y * (w * 4 + 1)] = 0;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) >>> 0 : 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + file.toString('base64');
}
const SIG = png();
const signPayload = (over) => Object.assign({ parentName: 'Elena Martinez', phone: '505-555-0101', email: 'elena.martinez@example.com', agree: true,
  parentSig: SIG, studentSig: SIG, userAgent: 'test', dp: { claimed: false }, vz: { claimed: false } }, over || {});

section('Pure helpers');
test('CSV / pasted table parsing', async () => {
  const p = internal('parseDelimited_', '﻿Student ID,Name\r\n1,"Doe, ""JJ"" Jane"\r\n\r\n2,Bob\r\n');
  assert.deepStrictEqual(Array.from(p.headers), ['student_id', 'name']);
  assert.strictEqual(p.records.length, 2);
  assert.strictEqual(p.records[0].data.name, 'Doe, "JJ" Jane');
  const t = internal('parseDelimited_', 'student_id\tgrade\n77\t6\n');
  assert.strictEqual(t.records[0].data.grade, '6');
});
test('cost sharing table', async () => {
  const shares = [{ school: 100, student: 0 }, { school: 50, student: 50 }, { school: 20, student: 80 }, { school: 0, student: 100 }];
  const cs = (n, c) => { const r = internal('costShare_', n, c, shares); return [r.school, r.student]; };
  assert.deepStrictEqual(cs(1, '59.00'), ['59.00', '0.00']);
  assert.deepStrictEqual(cs(2, '99.00'), ['49.50', '49.50']);
  assert.deepStrictEqual(cs(3, '22.80'), ['4.56', '18.24']);
  assert.deepStrictEqual(cs(4, '645'), ['0.00', '645.00']);
  assert.deepStrictEqual(cs(9, '49.99'), ['0.00', '49.99']);
});
test('PDF file name, Asset Tiger group, CSV and formula safety', async () => {
  assert.strictEqual(internal('pdfFileName_', "O'Connor", 'Liam', '5', ''), 'OConnor_Liam_Gr5_PENDING.pdf');
  assert.strictEqual(internal('pdfFileName_', 'García-López', 'Sofía', '6', 'CB-0042'), 'Garcia-Lopez_Sofia_Gr6_CB-0042.pdf');
  assert.strictEqual(internal('assetTigerGroup_', '5'), 'Elementary Student');
  assert.strictEqual(internal('assetTigerGroup_', '6'), 'Secondary Student');
  assert.strictEqual(internal('assetTigerGroup_', '12'), 'Secondary Student');
  assert.strictEqual(internal('csvCell_', '=1+1'), "'=1+1");
  assert.strictEqual(internal('csvCell_', 'a,"b"'), '"a,""b"""');
  assert.strictEqual(internal('safeCell_', '+15055550101'), "'+15055550101");
  assert.strictEqual(internal('normalizeDob_', '3/9/2014'), '2014-03-09');
  assert.strictEqual(internal('normalizeDob_', '2014-13-09'), '');
  assert.strictEqual(internal('winAnsi_', 'Nguy\u1EC5n Th\u1ECB \u00C1nh, Jos\u00E9 Pe\u00F1a'), 'Nguyen Thi \u00C1nh, Jos\u00E9 Pe\u00F1a');
  assert.strictEqual(internal('winAnsi_', '\u674E Wei'), '? Wei');
});

section('Setup');
test('setup() creates tabs, defaults and the first Admin', async () => {
  const msg = call(ADMIN, 'setup');
  assert.ok(/Setup finished/.test(msg));
  ['Config', 'Staff', 'Students', 'Signatures', 'Devices', 'Checkouts', 'Repairs', 'ActivityLog'].forEach((t) => assert.ok(state.sheets[t], t));
  assert.strictEqual(sheetRows('Staff')[0].email, ADMIN);
  assert.strictEqual(sheetRows('Config').find((c) => c.key === 'COST: Keyboard').value, '59.00 | 20.00');
  call(ADMIN, 'apiSaveSetting', 'DRIVE_FOLDER_ID', state.sharedRootId);
  call(ADMIN, 'apiSaveSetting', 'PARENT_APP_URL', 'https://script.google.com/macros/s/PARENT/exec');
  call(ADMIN, 'apiSaveSetting', 'STAFF_APP_URL', 'https://script.google.com/macros/s/STAFF/exec');
  call(ADMIN, 'apiSaveStaff', { email: IT, name: 'Tess Tech', role: 'IT Staff', active: true });
  call(ADMIN, 'apiSaveStaff', { email: HELPER, name: 'Val Volunteer', role: 'Station Helper', active: true });
  call(ADMIN, 'apiSaveSetting', 'SIGN_FORMS_ONLINE', 'N');   // these tests cover the paper path; the online forms are tested further down
  call(ADMIN, 'setup'); // safe to run twice
  assert.strictEqual(sheetRows('Staff').length, 3);
});
test('sample data: 10 students, 10 devices, unguessable unique codes', async () => {
  call(ADMIN, 'loadSampleData');
  call(ADMIN, 'loadSampleData');
  const s = sheetRows('Students');
  assert.strictEqual(s.length, 10);
  assert.strictEqual(sheetRows('Devices').length, 10);
  assert.strictEqual(new Set(s.map((x) => x.code)).size, 10);
  s.forEach((x) => { assert.ok(/^[A-Za-z0-9]{16}$/.test(x.code)); assert.ok(x.link.endsWith('/exec?code=' + x.code)); });
  assert.strictEqual(student('900002').last_name, "O'Connor");
});

section('Access control');
test('every browser-callable function refuses an anonymous caller', async () => {
  const open = ['doGet', 'apiParentLoad', 'apiParentSubmit', 'apiParentFind', 'apiParentDocs'];
  const names = Object.keys(env.ctx).filter((k) => typeof env.ctx[k] === 'function' && !/_$/.test(k));
  assert.ok(names.length > 40, 'found ' + names.length);
  for (const n of names.filter((x) => open.indexOf(x) < 0)) {
    await rejects(async () => call('', n), /Access denied|sign in/i);
    await rejects(async () => call('someone@gmail.com', n), /Access denied|sign in/i);
  }
});
test('Station Helper: station screen only, no contact data', async () => {
  ['apiListStudents', 'apiOverview', 'apiListDevices', 'apiReports', 'apiListRepairs', 'apiGetSettings', 'apiListStaff'].forEach((fn) => throws(() => call(HELPER, fn), /Access denied/));
  ['apiStudentDetail', 'apiGetPdf', 'apiGetLink'].forEach((fn) => throws(() => call(HELPER, fn, '900001'), /Access denied/));
  await rejects(async () => call(HELPER, 'apiRegeneratePdf', '900001'), /Access denied/);
  const r = call(HELPER, 'apiStationSearch', 'martinez');
  assert.strictEqual(r.length, 1);
  const json = JSON.stringify(r);
  assert.ok(!/example\.com|555|Elena|code|link"/.test(json), json);
  assert.strictEqual(call(HELPER, 'apiBoot').costs, undefined);
});
test('IT Staff cannot do Admin things or see parent contact', async () => {
  ['apiGetSettings', 'apiListStaff', 'apiAssetTigerExport'].forEach((fn) => throws(() => call(IT, fn), /Access denied/));
  throws(() => call(IT, 'apiImportCommit', 'student_id\n1', []), /Access denied/);
  throws(() => call(IT, 'apiSendBatch', ['900001']), /Access denied/);
  const d = call(IT, 'apiStudentDetail', '900001');
  assert.strictEqual(d.parent1_email, undefined);
  assert.strictEqual(call(ADMIN, 'apiStudentDetail', '900001').parent1_email, 'elena.martinez@example.com');
});
test('a switched-off helper is locked out; an Admin cannot lock themselves out', async () => {
  call(ADMIN, 'apiSetHelpersActive', false);
  throws(() => call(HELPER, 'apiStationSearch', 'ava'), /Access denied/);
  call(ADMIN, 'apiSetHelpersActive', true);
  assert.strictEqual(call(HELPER, 'apiStationSearch', 'ava').length, 1);
  throws(() => call(ADMIN, 'apiSaveStaff', { email: ADMIN, name: 'x', role: 'IT Staff', active: true }), /own Admin/);
});

console.log('\nImport');
const CSV = [
  'student_id,student_first_name,student_last_name,grade,parent1_name,parent1_email,parent1_phone,parent2_name,parent2_email,parent2_phone,preferred_language,date_of_birth',
  '900101,Nia,Okafor,8,Ada Okafor,ada@example.com,+1 505 555 0200,,,,English,2012-02-03',
  '900102,=HYPERLINK("http://evil"),Tester,7,@cmd,,505-555-0201,,,,Spanish,',
  '900103,Bad,Email,7,P,not-an-email,,,,,,',
  '900104,Too,Young,4,P,p@example.com,,,,,,',
  '900105,Dup,One,6,P,p1@example.com,,,,,,',
  '900105,Dup,Two,6,P,p2@example.com,,,,,,',
  ',No,Id,6,P,p3@example.com,,,,,,',
  '900106,No,Contact,6,P,,,,,,,',
  '900001,Ava,Martinez,5,Elena Martinez,elena.new@example.com,505-555-0101,,,,es,'
].join('\n');
test('preview flags new / update / problem rows', async () => {
  const items = call(ADMIN, 'apiImportPreview', CSV);
  const by = (st) => items.filter((i) => i.status === st).map((i) => i.data.student_id + ':' + i.data.last_name);
  assert.deepStrictEqual(by('new'), ['900101:Okafor', '900102:Tester']);
  assert.deepStrictEqual(by('update'), ['900001:Martinez']);
  assert.strictEqual(by('problem').length, 6);
  const upd = items.find((i) => i.status === 'update');
  assert.deepStrictEqual(upd.changes, [{ field: 'parent1_email', old: 'elena.martinez@example.com', new: 'elena.new@example.com' }]);
  assert.strictEqual(sheetRows('Students').length, 10, 'preview must not save');
});
test('commit adds new rows, applies only approved updates, sends no email, blocks formulas', async () => {
  let r = call(ADMIN, 'apiImportCommit', CSV, []);
  assert.deepStrictEqual(r, { added: 2, updated: 0, skipped: 7 });
  assert.strictEqual(student('900001').parent1_email, 'elena.martinez@example.com');
  r = call(ADMIN, 'apiImportCommit', CSV, ['900001']);
  assert.deepStrictEqual(r, { added: 0, updated: 1, skipped: 6 });
  assert.strictEqual(student('900001').parent1_email, 'elena.new@example.com');
  assert.strictEqual(student('900001').dob, '2015-03-14', 'blank import cell must not erase');
  assert.strictEqual(student('900102').first_name, '=HYPERLINK("http://evil")');
  assert.strictEqual(student('900101').parent1_phone, '+1 505 555 0200');
  assert.strictEqual(student('900102').language, 'es');
  assert.strictEqual(state.mails.length, 0);
  assert.ok(sheetRows('ActivityLog').some((a) => a.action === 'Student edited (import)' && /elena\.new/.test(a.details)));
  call(ADMIN, 'apiSaveStudent', { student_id: '900001', first_name: 'Ava', last_name: 'Martinez', grade: '5', dob: '2015-03-14',
    parent1_name: 'Elena Martinez', parent1_email: 'elena.martinez@example.com', parent1_phone: '505-555-0101', language: 'es' }, false);
  assert.ok(sheetRows('ActivityLog').some((a) => a.action === 'Student edited' && /"elena\.new@example\.com" -> "elena\.martinez@example\.com"/.test(a.details)));
});

section('Invitations');
test('bulk invite, both parents, language, quota pause + next-day resume', async () => {
  const p = call(ADMIN, 'apiSendPreview', 'invite', null);
  assert.strictEqual(p.ids.length, 10);      // 12 students, 2 without email
  assert.strictEqual(p.noEmail, 2);
  assert.ok(/Firme aquí: https:\/\/script\.google\.com\/macros\/s\/PARENT\/exec\?code=/.test(p.preview.body));
  state.quota = 7;
  const r = call(ADMIN, 'apiSendBatch', p.ids);
  assert.strictEqual(r.quotaReached, true);
  assert.strictEqual(r.sent + r.notSent.length, 10);
  assert.ok(state.mails.some((m) => m.to === 'sean.oconnor@example.com,maeve.oconnor@example.com'));
  const q = call(ADMIN, 'apiQueueSends', r.notSent);
  assert.strictEqual(q.queued, r.notSent.length);
  assert.strictEqual(state.triggers.length, 1);
  state.quota = 100;
  throws(() => call('', 'resumeQueuedSends'), /Access denied/);
  throws(() => call('', 'resumeQueuedSends', { triggerUid: 'made-up' }), /Access denied/);
  call('', 'resumeQueuedSends', { triggerUid: state.triggers[0].getUniqueId() }); // the real time trigger has no signed-in user
  assert.strictEqual(sheetRows('MailQueue').length, 0);
  assert.strictEqual(state.triggers.length, 0);
  assert.strictEqual(sheetRows('Students').filter((s) => s.invite_first_sent).length, 10);
  assert.strictEqual(student('900001').stage, 'Invited');
  assert.strictEqual(call(ADMIN, 'apiSendPreview', 'invite', null).ids.length, 0);
  call(ADMIN, 'apiSendBatch', ['900001']);
  assert.strictEqual(student('900001').reminders_count, '1');
  assert.ok(/Recordatorio/.test(state.mails[state.mails.length - 1].subject));
});

console.log('\nParent signing');
const ava = () => student('900001');
test('bad or unknown codes are rejected', async () => {
  assert.strictEqual(call('', 'apiParentLoad', 'nope').state, 'invalid');
  assert.strictEqual(call('', 'apiParentLoad', 'AAAAAAAAAAAAAAAA').state, 'invalid');
  await rejects(() => call('', 'apiParentSubmit', 'AAAAAAAAAAAAAAAA', signPayload()), /INVALID_LINK/);
});
test('opening the link shows the locked student info and records "Link opened"', async () => {
  const r = call('', 'apiParentLoad', ava().code);
  assert.strictEqual(r.state, 'open');
  assert.deepStrictEqual(r.student, { first: 'Ava', last: 'Martinez', grade: '5' });
  assert.strictEqual(r.lang, 'es');
  assert.strictEqual(r.costs.length, 7);
  assert.strictEqual(ava().stage, 'Link opened');
  assert.ok(ava().link_opened_date);
});
test('server-side validation of the submission', async () => {
  const c = ava().code;
  await rejects(() => call('', 'apiParentSubmit', c, signPayload({ agree: false })), /agree/);
  await rejects(() => call('', 'apiParentSubmit', c, signPayload({ email: 'x' })), /email/);
  await rejects(() => call('', 'apiParentSubmit', c, signPayload({ studentSig: '' })), /signature/i);
  await rejects(() => call('', 'apiParentSubmit', c, signPayload({ parentSig: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>'.repeat(10)).toString('base64') })), /signature/i);
  assert.strictEqual(ava().signed_date, '');
});
let firstPdfId;
test('signing saves signatures, PDF in Grade folder, receipt email, closes the link', async () => {
  const before = state.mails.length;
  const r = await call('', 'apiParentSubmit', ava().code, signPayload({ dp: { claimed: true } }));
  assert.strictEqual(r.state, 'done');
  assert.strictEqual(r.emailed, true, JSON.stringify(sheetRows('ActivityLog').filter((a) => /fail/i.test(a.action))));
  assert.deepStrictEqual(r.pending, ['dp']);
  const s = ava();
  assert.strictEqual(s.link_active, 'N');
  assert.strictEqual(s.stage, 'Student signed');
  assert.strictEqual(s.dp_status, 'Signed');
  assert.strictEqual(sheetRows('Signatures').filter((x) => x.student_id === '900001').length, 2);
  firstPdfId = s.pdf_file_id;
  const pdf = state.files[firstPdfId];
  assert.strictEqual(pdf.path(), 'Shared Drive – Chromebooks/Chromebook Agreements 2026-2027/Grade 5/Martinez_Ava_900001/Martinez_Ava_Gr5_ChromebookAgreement.pdf');
  const html = pdf.getBlob().getDataAsString();
  ['Chromebook Checkout', '$645.00', '4th Repair and beyond', 'Elena Martinez', 'data:image/png;base64,',
    'Signed electronically on ' + s.signed_date, 'Record ID: ' + s.agreement_id, 'itsupport@abqse.org'].forEach((x) => assert.ok(html.includes(x), x));
  assert.ok(/Martinez_Ava_900001\/_signatures\/Martinez_Ava_Gr5_900001_AGR-\w+_parent\.png$/.test(state.files[sheetRows('Signatures')[0].signature_file_id].path()));
  const mail = state.mails[state.mails.length - 1];
  assert.strictEqual(state.mails.slice(before).filter((m) => m.to === 'elena.martinez@example.com').length, 1);
  assert.ok(state.mails.slice(before).some((m) => /plain layout/.test(m.subject)), 'IT is warned that no blank form is set yet');
  assert.strictEqual(mail.to, 'elena.martinez@example.com');
  assert.strictEqual(mail.attachments.length, 1);
  assert.ok(/firmado/.test(mail.subject));
});
test('the link cannot be signed twice (second parent sees "already signed")', async () => {
  const c = ava().code;
  assert.strictEqual(call('', 'apiParentLoad', c).state, 'signed');
  assert.strictEqual((await call('', 'apiParentSubmit', c, signPayload({ parentName: 'Someone Else' }))).state, 'signed');
  assert.strictEqual(ava().signer_name, 'Elena Martinez');
  assert.strictEqual(sheetRows('Signatures').filter((x) => x.student_id === '900001').length, 2);
});
test('backup lookup by student ID + date of birth, rate limited', async () => {
  assert.strictEqual(call('', 'apiParentFind', '900003', '2014-11-22').state, 'notfound');
  const r = call('', 'apiParentFind', '900003', '11/23/2014');
  assert.strictEqual(r.code, student('900003').code);
  for (let i = 0; i < 6; i++) call('', 'apiParentFind', '900004', '2000-01-01');
  assert.strictEqual(call('', 'apiParentFind', '900004', '2014-01-30').state, 'locked');
});
test('"Generate new link" disables the old link', async () => {
  const old = student('900003').code;
  call(ADMIN, 'apiNewLink', '900003');
  assert.strictEqual(call('', 'apiParentLoad', old).state, 'invalid');
  assert.strictEqual(call('', 'apiParentLoad', student('900003').code).state, 'open');
});
test('upload mode saves the parent\'s photo of the outside form', async () => {
  call(ADMIN, 'apiSaveSetting', 'OUTSIDE_FORMS_METHOD', 'upload');
  const jpg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(200, 7)]).toString('base64');
  await rejects(() => call('', 'apiParentSubmit', student('900003').code, signPayload({ dp: { file: { base64: Buffer.from('MZ evil exe').toString('base64') } } })), /JPG, PNG or PDF/);
  const r = await call('', 'apiParentSubmit', student('900003').code, signPayload({ parentName: 'Tina Begay', email: 'tina.begay@example.com', dp: { file: { base64: jpg } } }));
  assert.strictEqual(r.state, 'done');
  const s = student('900003');
  assert.strictEqual(s.dp_status, 'Signed');
  assert.ok(/Grade 6\/Begay_Noah_900003\/Begay_Noah_Gr6_900003_DigitalPromise_upload\.jpg$/.test(state.files[s.dp_file_id].path()));
  assert.strictEqual(call(IT, 'apiGetOutsideFile', '900003', 'dp').mime, 'image/jpeg');
  call(ADMIN, 'apiSaveSetting', 'OUTSIDE_FORMS_METHOD', 'staff');
});

section('Deployment day');
test('Station 1 refuses until the Digital Promise form is verified', async () => {
  const v = call(HELPER, 'apiStationGet', '900001');
  assert.strictEqual(v.ready, false);
  assert.ok(/Digital Promise/.test(v.missing.join()));
  throws(() => call(HELPER, 'apiStation1Verify', '900001'), /NOT READY/);
  await rejects(() => call(HELPER, 'apiAssignDevice', '900001', 'TEST-1001', false), /NOT READY/);
  throws(() => call(HELPER, 'apiSetOutsideForm', '900001', 'dp', 'Verified by staff'), /ask IT/);
  call(IT, 'apiSetOutsideForm', '900001', 'dp', 'Verified by staff');
  assert.strictEqual(ava().stage, 'Outside forms complete');
  const ok = call(HELPER, 'apiStation1Verify', '900001');
  assert.strictEqual(ok.ready, true);
  assert.strictEqual(ava().stage, 'Verified at Station 1');
});
test('Station 1 "Sign now" gives the kiosk link for an unsigned student only', async () => {
  assert.ok(call(HELPER, 'apiStationSignLink', '900005').link.endsWith('?code=' + student('900005').code));
  throws(() => call(HELPER, 'apiStationSignLink', '900001'), /already signed/);
});
test('assigning a Chromebook saves a separate check-out record and leaves the signed agreement alone', async () => {
  await rejects(() => call(HELPER, 'apiAssignDevice', '900001', 'NOPE-1', false), /not in the Devices list/);
  await rejects(() => call(HELPER, 'apiAssignDevice', '900001', 'TEST-1010', false), /"Loaner"/);
  const r = await call(HELPER, 'apiAssignDevice', '900001', ' test-1001 ', false);
  assert.strictEqual(r.assigned, true);
  assert.strictEqual(r.student.tag, 'TEST-1001');
  assert.strictEqual(device('TEST-1001').status, 'Assigned');
  assert.strictEqual(device('TEST-1001').assigned_student, '900001');
  assert.strictEqual(ava().stage, 'Chromebook assigned');
  const co = sheetRows('Checkouts');
  assert.strictEqual(co.length, 1);
  assert.strictEqual(co[0].staff_email, HELPER);
  const s = ava();
  assert.strictEqual(s.pdf_file_id, firstPdfId, 'the signed agreement is not touched at check-out');
  assert.ok(!state.files[firstPdfId].getBlob().getDataAsString().includes('ASE Staff use only'));
  const record = state.files[s.checkout_pdf_file_id];
  assert.ok(/Grade 5\/Martinez_Ava_900001\/Martinez_Ava_Gr5_CheckoutRecord_TEST-1001\.pdf$/.test(record.path()), record.path());
  assert.strictEqual(record.getBlob()._buf().slice(0, 5).toString(), '%PDF-');
  assert.ok(!/mock/.test(record.getBlob()._buf().slice(0, 20).toString()));
  assert.strictEqual(call(IT, 'apiGetPdf', '900001', 'record').name, 'Martinez_Ava_Gr5_CheckoutRecord_TEST-1001.pdf');
  if (process.env.PDF_OUT) require('fs').writeFileSync(process.env.PDF_OUT + '/record.pdf', record.getBlob()._buf());
  assert.strictEqual((await call(HELPER, 'apiAssignDevice', '900001', 'TEST-1001', false)).already, true);
});
test('one device per student, one student per device', async () => {
  call(IT, 'apiSetOutsideForm', '900003', 'dp', 'Verified by staff');
  await rejects(() => call(HELPER, 'apiAssignDevice', '900003', 'TEST-1001', false), /already assigned to another student/);
  await rejects(() => call(HELPER, 'apiAssignDevice', '900001', 'TEST-1002', false), /already has Chromebook TEST-1001/);
  assert.strictEqual((await call(IT, 'apiAssignDevice', '900001', 'TEST-1002', false)).needsConfirm, true);
  assert.strictEqual(device('TEST-1002').status, 'In stock');
  await call(IT, 'apiAssignDevice', '900003', 'SNTEST000003', false); // serial number also works
  assert.strictEqual(student('900003').asset_tag, 'TEST-1003');
  assert.strictEqual(sheetRows('Checkouts').length, 2);
});
test('Station 3 verify working / problem to IT', async () => {
  throws(() => call(HELPER, 'apiVerifyWorking', '900005', true, ''), /no Chromebook/);
  const n = state.mails.length;
  call(HELPER, 'apiVerifyWorking', '900003', false, 'Will not turn on');
  assert.ok(/Deployment day problem/.test(state.mails[n].subject) && state.mails[n].to === 'itsupport@abqse.org');
  assert.strictEqual(call(HELPER, 'apiVerifyWorking', '900001', true, '').working, true);
  assert.strictEqual(ava().stage, 'Verified working');
});
test('Asset Tiger export with the grade rule, then "Entered in Asset Tiger"', async () => {
  const r = call(ADMIN, 'apiAssetTigerExport');
  assert.strictEqual(r.count, 2);
  const lines = r.csv.trim().split('\r\n');
  assert.strictEqual(lines[0], 'Asset Tag ID,Serial No,Student Name,Student ID,Grade,Assign To,Check-out Date,Checked Out By');
  assert.ok(/^TEST-1001,SNTEST000001,Ava Martinez,900001,5,Elementary Student,\d{4}-\d\d-\d\d,Val Volunteer$/.test(lines[1]), lines[1]);
  assert.ok(/,6,Secondary Student,/.test(lines[2]));
  assert.strictEqual(call(ADMIN, 'apiMarkAssetTiger', r.ids).marked, 2);
  assert.strictEqual(ava().stage, 'Entered in Asset Tiger');
  assert.strictEqual(call(ADMIN, 'apiAssetTigerExport').count, 0);
});

section('After deployment');
test('repairs: numbering, automatic cost sharing, device status, stage restore', async () => {
  const r1 = call(IT, 'apiCreateRepair', { studentId: '900001', type: 'repair', description: 'Cracked screen' });
  assert.strictEqual(r1.repair_number, '1');
  assert.strictEqual(r1.serial_number, 'SNTEST000001');
  assert.strictEqual(ava().stage, 'Repair open');
  let u = call(IT, 'apiUpdateRepair', r1.repair_id, { replacement: 'Touch Panel/Screen', cost: '99.00', status: 'In repair' });
  assert.deepStrictEqual([u.school_share, u.student_share], ['99.00', '0.00']);
  assert.strictEqual(device('TEST-1001').status, 'In repair');
  u = call(IT, 'apiUpdateRepair', r1.repair_id, { status: 'Closed' });
  assert.ok(u.closed_date);
  assert.strictEqual(device('TEST-1001').status, 'Assigned');
  assert.strictEqual(ava().stage, 'Entered in Asset Tiger');
  const r2 = call(IT, 'apiCreateRepair', { studentId: '900001', type: 'repair', description: 'Keyboard keys missing' });
  u = call(IT, 'apiUpdateRepair', r2.repair_id, { cost: '$59' });
  assert.deepStrictEqual([u.repair_number, u.school_share, u.student_share], ['2', '29.50', '29.50']);
  throws(() => call(IT, 'apiUpdateRepair', r2.repair_id, { cost: 'abc' }), /number/);
  assert.strictEqual(call(IT, 'apiReports').unpaid.length, 1);
  call(IT, 'apiUpdateRepair', r2.repair_id, { paid: true, status: 'Closed' });
  assert.strictEqual(call(IT, 'apiReports').unpaid.length, 0);
});
test('student repair form needs a school account + matching ID and last name', async () => {
  throws(() => call('kid@gmail.com', 'apiStudentReport', { studentId: '900003', lastName: 'Begay', type: 'repair', description: 'Broken hinge' }), /school Google account/);
  throws(() => call('kid@abqse.org', 'apiStudentReport', { studentId: '900003', lastName: 'Wrong', type: 'repair', description: 'Broken hinge' }), /could not match/);
  const r = call('kid@abqse.org', 'apiStudentReport', { studentId: '900003', lastName: 'begay', type: 'repair', description: 'Broken hinge' });
  assert.ok(r.ok);
  assert.strictEqual(sheetRows('Repairs').find((x) => x.repair_id === r.id).reported_by, 'kid@abqse.org');
});
test('loaners: issue, one at a time, overdue flag, return', async () => {
  call(IT, 'apiIssueLoaner', '900003', 'TEST-1010');
  assert.strictEqual(student('900003').stage, 'Loaner issued');
  assert.strictEqual(device('TEST-1010').assigned_student, '900003');
  throws(() => call(IT, 'apiIssueLoaner', '900003', 'TEST-1009'), /already has a loaner/);
  throws(() => call(IT, 'apiIssueLoaner', '900001', 'TEST-1010'), /already with a student/);
  const l = call(IT, 'apiListLoaners');
  assert.strictEqual(l.out.length, 1);
  assert.ok(/ 16:00:00$/.test(l.out[0].due));
  call(IT, 'apiReturnLoaner', l.out[0].checkout_id);
  assert.strictEqual(device('TEST-1010').assigned_student, '');
  assert.strictEqual(device('TEST-1010').status, 'Loaner');
  assert.strictEqual(student('900003').stage, 'Repair open');
});
test('lost report sets the device to Lost and notifies IT; claims rate warns', async () => {
  const n = state.mails.length;
  // A Dell gets the Dell replacement price from the second price column.
  state.user = ADMIN;
  internal('update_', 'Devices', 'asset_tag', 'TEST-1003', { model: 'Dell 3100/3110' });
  const r = call(IT, 'apiCreateRepair', { studentId: '900003', type: 'lost', description: 'Left on the bus' });
  assert.strictEqual(r.cost, '350.00');
  assert.strictEqual(call(IT, 'apiListRepairs').find((x) => x.repair_id === r.repair_id).model, 'Dell 3100/3110');
  assert.strictEqual(device('TEST-1003').status, 'Lost');
  assert.strictEqual(student('900003').stage, 'Lost/Stolen reported');
  assert.ok(/LOST\/STOLEN/.test(state.mails[n].subject));
  const c = call(IT, 'apiReports').claims;
  assert.deepStrictEqual([c.incidents, c.fleet, c.rate, c.level], [4, 10, 40, 'over']);
});
test('returns and "not returned – records hold"', async () => {
  call(IT, 'apiMarkNotReturned', '900001', 'Withdrew, no answer');
  assert.strictEqual(call(ADMIN, 'apiReports').notReturned.length, 1);
  call(IT, 'apiReturnDevice', '900001', 'Brought it back');
  assert.strictEqual(ava().stage, 'Returned');
  assert.strictEqual(ava().asset_tag, '');
  assert.strictEqual(device('TEST-1001').status, 'In stock');
  assert.strictEqual(device('TEST-1001').assigned_student, '');
  assert.ok(sheetRows('Checkouts').find((c) => c.asset_tag === 'TEST-1001').returned_date);
  assert.strictEqual(call(ADMIN, 'apiReports').notReturned.length, 0);
  // the device can go out again
  assert.strictEqual((await call(IT, 'apiAssignDevice', '900001', 'TEST-1001', false)).assigned, true);
});

section('Inventory, reports, pages');
test('device import: flexible headers, duplicates, never touches status', async () => {
  const csv = 'Asset Tag,Serial Number,IMEI,MAC Address\nCB-2001,SN2001,111,AA:BB\nCB-2001,SN2002,,\n,SN2003,,\nTEST-1001,SNTEST000001,999,\nCB-2004,SNTEST000002,,\n';
  const items = call(ADMIN, 'apiDeviceImportPreview', csv);
  assert.deepStrictEqual(items.map((i) => i.status), ['new', 'problem', 'problem', 'update', 'problem']);
  const r = call(ADMIN, 'apiDeviceImportCommit', csv, ['TEST-1001']);
  assert.deepStrictEqual(r, { added: 1, updated: 1, skipped: 3 });
  assert.strictEqual(device('CB-2001').status, 'In stock');
  assert.strictEqual(device('CB-2001').model, 'CTL PX112CT-L');
  assert.strictEqual(device('TEST-1001').imei, '999');
  assert.strictEqual(device('TEST-1001').status, 'Assigned');
  throws(() => call(ADMIN, 'apiSaveDevice', { asset_tag: 'TEST-1001', serial_number: 'SNTEST000001', status: 'Retired' }, false), /Chromebook returned/);
});
test('overview, inventory, missing forms, QR data', async () => {
  const o = call(IT, 'apiOverview');
  assert.strictEqual(o.totals.total, 12);
  assert.strictEqual(o.totals.signed, 2);
  assert.strictEqual(o.totals.noEmail, 2);
  assert.strictEqual(o.grades.map((g) => g.grade).join(), '5,6,7,8,9,10,12');
  const inv = call(IT, 'apiInventoryReport');
  assert.strictEqual(inv.total, 11);
  assert.strictEqual(inv.counts.Lost, 1);
  assert.ok(call(IT, 'apiInventoryPdf').base64.length > 100);
  const csv = call(IT, 'apiMissingFormsCsv');
  assert.ok(/Chromebook Checkout Form is not signed/.test(csv) && !/example\.com/.test(csv));
  assert.ok(/example\.com/.test(call(ADMIN, 'apiMissingFormsCsv')));
  assert.strictEqual(call(ADMIN, 'apiQrData', ['900006', '900001']).letters.length, 1);
  const d = call(ADMIN, 'apiStudentDetail', '900001');
  assert.ok(d.activity.length > 10 && d.repairs.length === 2 && d.has_pdf && d.pdf_link === undefined);
  assert.ok(sheetRows('ActivityLog').some((a) => a.action === 'PDF created'));
  call(IT, 'apiGetPdf', '900001');
  assert.ok(sheetRows('ActivityLog').some((a) => a.action === 'PDF viewed' && a.user_email === IT));
});
test('pages render for the right audience', async () => {
  const page = (user, params) => { state.user = user; return env.ctx.doGet({ parameter: params }).getContent(); };
  assert.ok(/apiParentLoad/.test(page('', { code: ava().code })));
  assert.ok(/"mode":"find"/.test(page('', { page: 'find' })));
  assert.ok(/"code":""/.test(page('', { code: '<script>alert(1)</script>' })));
  assert.ok(/"reason":"staff"/.test(page('', {})));
  assert.ok(/"reason":"staff"/.test(page('someone@gmail.com', {})));
  assert.ok(/apiBoot/.test(page(HELPER, {})));
  assert.ok(/"reason":"school"/.test(page('', { page: 'repair' })));
  assert.ok(/apiStudentReport/.test(page('kid@abqse.org', { page: 'lost' })));
});

section('Check-outs list');
test('who got which Chromebook, from whom and when: in the app, as a file and as a Google Sheet', async () => {
  throws(() => call(HELPER, 'apiListCheckouts'), /Access denied/);
  throws(() => call(IT, 'apiCheckoutsToSheet'), /Access denied/);
  const list = call(IT, 'apiListCheckouts');
  const first = list.find((c) => c.tag === 'TEST-1001' && c.returned);   // Ava's first check-out, by the helper
  assert.deepStrictEqual([first.student, first.grade, first.studentId, first.serial, first.by, first.byEmail, first.kind],
    ['Ava Martinez', '5', '900001', 'SNTEST000001', 'Val Volunteer', HELPER, 'Chromebook']);
  assert.ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(first.at));
  assert.ok(list.some((c) => c.kind === 'Loaner' && c.tag === 'TEST-1010'));
  assert.ok(list.some((c) => c.tag === 'TEST-1001' && !c.returned && c.by === 'Tess Tech'), 'given out again later by IT');
  const csv = call(IT, 'apiCheckoutsCsv').trim().split('\r\n');
  assert.strictEqual(csv[0], 'Date and time,Student,Grade,Student ID,Asset tag,Serial number,Checked out by,Staff email,Kind,Checked working,Returned');
  assert.strictEqual(csv.length, list.length + 1);
  const r = call(ADMIN, 'apiCheckoutsToSheet');
  assert.ok(/^Chromebook check-outs \d{4}-\d\d-\d\d \d\d:\d\d$/.test(r.name));
  assert.strictEqual(r.rows, list.length);
  const made = Object.values(state.created).pop();
  const grid = made.sheet._raw.data;
  assert.deepStrictEqual(grid[0].slice(0, 7), ['Date and time', 'Student', 'Grade', 'Student ID', 'Asset tag', 'Serial number', 'Checked out by']);
  assert.strictEqual(grid.length, list.length + 1);
  assert.ok(/Chromebook Agreements 2026-2027\/Chromebook check-outs/.test(made.file.path()), made.file.path());
});

section('Simple screens');
test('Home summary counts what is waiting at each step', async () => {
  throws(() => call(HELPER, 'apiHome'), /Access denied/);
  const h = call(ADMIN, 'apiHome');
  assert.strictEqual(h.students, 12);
  assert.strictEqual(h.signed, 2);
  assert.strictEqual(h.noEmail, 2);
  assert.strictEqual(h.notSent, 0);
  assert.strictEqual(h.toRemind, 8);
  assert.strictEqual(h.withDevice, 2);
  assert.strictEqual(h.devices, 11);
  assert.strictEqual(h.claims.level, 'over');
  assert.strictEqual(typeof h.quota, 'number');
  assert.strictEqual(call(IT, 'apiHome').quota, undefined);
});
test('each student has one plain status sentence and one next step', async () => {
  const by = {};
  call(IT, 'apiListStudents').forEach((s) => { by[s.id] = s.status.text; });
  assert.strictEqual(by['900006'], 'No email on file, link not sent');
  assert.strictEqual(by['900002'], 'Link sent, has not signed');
  assert.strictEqual(by['900003'], 'Chromebook reported lost or stolen');
  assert.strictEqual(by['900001'], 'Has Chromebook TEST-1001, not checked yet');
  const step = (id) => call(HELPER, 'apiStationGet', id).step;
  assert.strictEqual(step('900005'), 'sign');
  assert.strictEqual(step('900003'), 'after');   // reported lost: not "finished", IT handles it
  assert.strictEqual(step('900001'), 'check');
  call(ADMIN, 'apiSaveStudent', { student_id: '900200', first_name: 'Step', last_name: 'Walker', grade: '7', parent1_phone: '505-555-0199' }, true);
  await call('', 'apiParentSubmit', student('900200').code, signPayload());
  assert.strictEqual(step('900200'), 'forms');
  assert.strictEqual(call(HELPER, 'apiStationGet', '900200').status.text, 'Signed. Digital Promise form is missing');
  call(IT, 'apiSetOutsideForm', '900200', 'dp', 'Verified by staff');
  assert.strictEqual(step('900200'), 'verify');
  call(HELPER, 'apiStation1Verify', '900200');
  assert.strictEqual(step('900200'), 'assign');
  await call(HELPER, 'apiAssignDevice', '900200', 'TEST-1005', false);
  assert.strictEqual(step('900200'), 'check');
  call(HELPER, 'apiVerifyWorking', '900200', true, '');
  assert.strictEqual(step('900200'), 'done');
  assert.strictEqual(call(HELPER, 'apiStationGet', '900200').status.text, 'Has Chromebook TEST-1005');
});
test('settings forms save several values at once and refuse bad ones without saving any', async () => {
  throws(() => call(IT, 'apiSaveSettings', { CAMPUS: 'x' }), /Access denied/);
  throws(() => call(ADMIN, 'apiSaveSettings', { CAMPUS: 'ASE East', 'COST: Keyboard': 'cheap' }), /needs a price/);
  const cfg = () => Object.fromEntries(sheetRows('Config').map((c) => [c.key, c.value]));
  assert.strictEqual(cfg().CAMPUS, 'ASE West');
  call(ADMIN, 'apiSaveSettings', { CAMPUS: 'ASE West Campus', 'COST: Keyboard': '61.50', VERIZON_REQUIRED: 'N' });
  assert.strictEqual(cfg().CAMPUS, 'ASE West Campus');
  assert.strictEqual(cfg()['COST: Keyboard'], '61.50');
  assert.strictEqual(call('', 'apiParentLoad', student('900005').code).costs.find((c) => c.name === 'Keyboard').cost, 61.5);
  throws(() => call(ADMIN, 'apiSaveSettings', { 'SHARE: 2nd Repair': 'half' }), /two percentages/);
  throws(() => call(ADMIN, 'apiSaveSettings', { IT_EMAIL: 'nope' }), /email address/);
});

section('Scale');
test('1,500 students + 30,000 log lines: station and signing writes never read the whole log', async () => {
  const big = [], logs = [];
  for (let i = 0; i < 1500; i++) big.push({ student_id: 'B' + i, first_name: 'Bulk' + i, last_name: 'Student', grade: String(5 + (i % 8)), parent1_email: 'p' + i + '@example.com', language: 'en' });
  for (let i = 0; i < 30000; i++) logs.push({ timestamp: '2026-10-01 08:00:00', user_email: 'x', student_id: 'B' + (i % 1500), action: 'Filler', details: '' });
  state.user = ADMIN;
  internal('withLock_', () => { const taken = internal('takenCodes_'); internal('insert_', 'Students', big.map((s) => internal('newStudentRow_', s, taken))); });
  internal('insert_', 'ActivityLog', logs);
  const logReads = () => state.reads.ActivityLog || 0;
  const s = () => student('B7');
  let before = logReads();
  call('', 'apiParentLoad', s().code);
  await call('', 'apiParentSubmit', s().code, signPayload());
  call(IT, 'apiSetOutsideForm', 'B7', 'dp', 'Verified by staff');
  call(HELPER, 'apiStationSearch', 'bulk7');
  call(HELPER, 'apiStation1Verify', 'B7');
  await call(HELPER, 'apiAssignDevice', 'B7', 'TEST-1002', false);
  call(HELPER, 'apiVerifyWorking', 'B7', true, '');
  call(ADMIN, 'apiSendBatch', ['B8', 'B9']);
  assert.strictEqual(student('B7').stage, 'Verified working');
  assert.ok(logReads() - before < 500, 'ActivityLog cells read: ' + (logReads() - before));
  assert.strictEqual(call(IT, 'apiListStudents').length, 1513);
});

section('All three forms online, on the school\'s own PDFs');
const onlinePayload = (over) => signPayload(Object.assign({ parentName: 'Rosa Chavez', email: 'rosa.chavez@example.com',
  parentInitials: 'rc', studentInitials: 'L.C.', dpParent: Array(9).fill(true), dpStudent: Array(9).fill(true), vzConsent: 'agree' }, over || {}));
test('the parent must complete every form before anything is saved', async () => {
  call(ADMIN, 'apiSaveSettings', { SIGN_FORMS_ONLINE: 'Y', CHECKOUT_TEMPLATE_FILE_ID: state.templates.checkout, DP_TEMPLATE_FILE_ID: state.templates.dp, VZ_TEMPLATE_FILE_ID: state.templates.vz });
  const c = student('900007').code;
  const load = call('', 'apiParentLoad', c);
  assert.strictEqual(load.online, true);
  assert.strictEqual(load.dpText.checklist.length, 9);
  assert.ok(/\{\{end_user\}\} \(the “End User”/.test(load.dpText.blocks[0].p) && /Photography/.test(load.vzText.blocks[1].p));
  assert.ok(/international calls/.test(load.dpText.checklist[5]) && !load.dpText.checklist.some((l) => /kind and safe/.test(l)));
  assert.deepStrictEqual(load.vzText.choices, { agree: 'Agree and Consent', decline: 'DO NOT Consent' });
  await rejects(() => call('', 'apiParentSubmit', c, onlinePayload({ parentInitials: '' })), /initials/);
  await rejects(() => call('', 'apiParentSubmit', c, onlinePayload({ studentInitials: '12' })), /initials/);
  const missed = Array(9).fill(true); missed[4] = false;
  await rejects(() => call('', 'apiParentSubmit', c, onlinePayload({ dpStudent: missed })), /Every line/);
  await rejects(() => call('', 'apiParentSubmit', c, onlinePayload({ dpParent: [true] })), /Every line/);
  await rejects(() => call('', 'apiParentSubmit', c, onlinePayload({ vzConsent: '' })), /Verizon/);
  await rejects(() => call('', 'apiParentSubmit', c, onlinePayload({ vzConsent: 'maybe' })), /Verizon/);
  assert.strictEqual(student('900007').signed_date, '');
  assert.strictEqual(student('900007').student_folder_id, '');
});
test('one sitting produces three filled PDFs in the student\'s own folder, emailed to the parent', async () => {
  const { PDFDocument } = env.ctx.PDFLib;   // the same library the app uses
  const before = state.mails.length;
  const r = await call('', 'apiParentSubmit', student('900007').code, onlinePayload());
  assert.deepStrictEqual([r.state, r.emailed, r.documents, r.pending.length], ['done', true, 3, 0]);
  const s = student('900007');
  assert.deepStrictEqual([s.dp_status, s.vz_status, s.vz_consent, s.pg_initials, s.s_initials], ['Signed online', 'Signed online', 'Agree and Consent', 'RC', 'LC']);
  assert.strictEqual(s.stage, 'Outside forms complete');
  const folder = 'Shared Drive – Chromebooks/Chromebook Agreements 2026-2027/Grade 8/Chavez_Lucas_900007/';
  const expected = { pdf_file_id: ['Chavez_Lucas_Gr8_ChromebookAgreement.pdf', 2, 'checkout'], dp_pdf_file_id: ['Chavez_Lucas_Gr8_DigitalPromise.pdf', 3, 'dp'], vz_pdf_file_id: ['Chavez_Lucas_Gr8_VerizonRelease.pdf', 2, 'vz'] };
  for (const field of Object.keys(expected)) {
    const file = state.files[s[field]];
    assert.strictEqual(file.path(), folder + expected[field][0]);
    const bytes = file.getBlob()._buf();
    assert.strictEqual(bytes.slice(0, 5).toString(), '%PDF-');
    assert.ok(!/mock/.test(bytes.slice(0, 20).toString()), 'should be the real form, not the plain fallback');
    const blank = state.files[state.templates[expected[field][2]]].getBlob()._buf();
    assert.ok(bytes.length > blank.length * 0.5, 'filled form kept the original content');
    assert.strictEqual((await PDFDocument.load(internal('toUint8_', Array.from(bytes)))).getPageCount(), expected[field][1]);
    if (process.env.PDF_OUT) require('fs').writeFileSync(process.env.PDF_OUT + '/' + expected[field][0], bytes);
  }
  assert.ok(state.folders[s.student_folder_id].getFoldersByName('_signatures').hasNext());
  const mail = state.mails[state.mails.length - 1];
  assert.strictEqual(state.mails.length, before + 1);
  assert.deepStrictEqual(Array.from(mail.attachments).map((a) => a.getName()), Object.keys(expected).map((k) => expected[k][0]));
  assert.ok(!sheetRows('ActivityLog').some((a) => a.student_id === '900007' && /plain layout used/.test(a.action)), 'no fallback should have been needed');
});
test('the family can download the very same PDFs that were saved, for one hour', async () => {
  const code = student('900008').code;
  const r = await call('', 'apiParentSubmit', code, onlinePayload({ parentName: 'Daniel Kim', email: 'daniel.kim@example.com', parentInitials: 'DK', studentInitials: 'IK' }));
  const s = student('900008');
  assert.deepStrictEqual(r.files.map((f) => f.kind + ':' + f.name), ['checkout:Kim_Isabella_Gr9_ChromebookAgreement.pdf', 'dp:Kim_Isabella_Gr9_DigitalPromise.pdf', 'vz:Kim_Isabella_Gr9_VerizonRelease.pdf']);
  const saved = { checkout: s.pdf_file_id, dp: s.dp_pdf_file_id, vz: s.vz_pdf_file_id };
  r.files.forEach((f) => assert.ok(Buffer.from(f.base64, 'base64').equals(state.files[saved[f.kind]].getBlob()._buf()), f.kind + ' download is byte for byte the saved file'));
  assert.strictEqual(Buffer.from(r.files[1].base64, 'base64').slice(0, 5).toString(), '%PDF-');
  // Reopening the link within the hour still offers the download.
  assert.strictEqual(call('', 'apiParentLoad', code).canDownload, true);
  assert.strictEqual(call('', 'apiParentDocs', code).length, 3);
  assert.ok(sheetRows('ActivityLog').some((a) => a.student_id === '900008' && /downloaded by the family/.test(a.action)));
  throws(() => call('', 'apiParentDocs', 'AAAAAAAAAAAAAAAA'), /download time has ended/);
  throws(() => call('', 'apiParentDocs', student('900010').code), /download time has ended/);   // not signed yet
  // Two hours later the link only says "already signed".
  state.user = ADMIN;
  internal('update_', 'Students', 'student_id', '900008', { signed_date: '2026-01-01 08:00:00' });
  assert.strictEqual(call('', 'apiParentLoad', code).canDownload, false);
  throws(() => call('', 'apiParentDocs', code), /download time has ended/);
  assert.strictEqual(call(IT, 'apiGetPdf', '900008', 'dp').name, 'Kim_Isabella_Gr9_DigitalPromise.pdf');   // staff still can
});
test('a student who signed everything online is READY without staff checking a paper form', async () => {
  const v = call(HELPER, 'apiStationGet', '900007');
  assert.deepStrictEqual([v.ready, v.dpOk, v.step], [true, true, 'verify']);
  call(HELPER, 'apiStation1Verify', '900007');
  const r = await call(HELPER, 'apiAssignDevice', '900007', 'TEST-1006', false);
  assert.strictEqual(r.assigned, true);
  const s = student('900007');
  assert.ok(/Chavez_Lucas_900007\/Chavez_Lucas_Gr8_ChromebookAgreement\.pdf$/.test(state.files[s.pdf_file_id].path()));
  assert.ok(/Chavez_Lucas_900007\/Chavez_Lucas_Gr8_CheckoutRecord_TEST-1006\.pdf$/.test(state.files[s.checkout_pdf_file_id].path()));
  assert.ok(!state.folders[s.student_folder_id].getFoldersByName('_previous').hasNext(), 'nothing the family signed was replaced');
  assert.strictEqual(state.folders[s.student_folder_id]._f.files.length, 4, 'three signed forms and one check-out record');
  assert.strictEqual(call(IT, 'apiGetPdf', '900007', 'dp').name, 'Chavez_Lucas_Gr8_DigitalPromise.pdf');
  assert.strictEqual(call(IT, 'apiGetPdf', '900007', 'vz').name, 'Chavez_Lucas_Gr8_VerizonRelease.pdf');
  await rejects(async () => call(HELPER, 'apiGetPdf', '900007', 'dp'), /Access denied/);
});
test('if a blank form is missing, a plain copy is still saved and the gap is logged', async () => {
  call(ADMIN, 'apiSaveSettings', { DP_TEMPLATE_FILE_ID: 'not-a-real-file' });
  await call('', 'apiParentSubmit', student('900009').code, onlinePayload({ parentName: 'Luz Sanchez', email: 'luz.sanchez@example.com' }));
  const s = student('900009');
  assert.ok(/mock/.test(state.files[s.dp_pdf_file_id].getBlob()._buf().slice(0, 20).toString()));
  assert.ok(state.files[s.dp_pdf_file_id].getBlob().getDataAsString().includes('END USER PARTICIPATION AGREEMENT FOR 2026-2027 SCHOOL YEAR'));
  assert.ok(state.files[s.dp_pdf_file_id].getBlob().getDataAsString().includes('Participant Name: <b>'));
  assert.ok(!/mock/.test(state.files[s.vz_pdf_file_id].getBlob()._buf().slice(0, 20).toString()));
  assert.ok(sheetRows('ActivityLog').some((a) => a.student_id === '900009' && /plain layout used/.test(a.action)));
  assert.ok(state.mails.some((m) => /plain layout/.test(m.subject) && m.to === 'itsupport@abqse.org'), 'IT is told the same day');
  assert.strictEqual(call(ADMIN, 'apiHome').formsReady, true);
  call(ADMIN, 'apiSaveSettings', { VZ_TEMPLATE_FILE_ID: '' });
  assert.strictEqual(call(ADMIN, 'apiHome').formsReady, false);
  call(ADMIN, 'apiSaveSettings', { VZ_TEMPLATE_FILE_ID: state.templates.vz });
  call(ADMIN, 'apiSaveSettings', { DP_TEMPLATE_FILE_ID: state.templates.dp });
});
test('two price columns when the school lists two Chromebook models', async () => {
  call(ADMIN, 'apiSaveSettings', { DEVICE_MODEL: 'CTL PX112CT-L | Dell 3100/3110', 'COST: Keyboard': '59.00 | 20.00' });
  const load = call('', 'apiParentLoad', student('900010').code);
  assert.deepStrictEqual(load.models, ['CTL PX112CT-L', 'Dell 3100/3110']);
  assert.deepStrictEqual(load.costs.find((c) => c.name === 'Keyboard').costs, [59, 20]);
});
test('a parent can answer DO NOT Consent on the Verizon release; the form still counts and staff see the answer', async () => {
  const r = await call('', 'apiParentSubmit', student('900010').code, onlinePayload({ parentName: 'Mark Lee', email: 'mark.lee@example.com', vzConsent: 'decline' }));
  assert.deepStrictEqual([r.state, r.pending.length], ['done', 0]);
  const s = student('900010');
  assert.deepStrictEqual([s.vz_status, s.vz_consent], ['Signed online', 'DO NOT Consent']);
  assert.strictEqual(call(IT, 'apiStudentDetail', '900010').vz_consent, 'DO NOT Consent');
  assert.ok(sheetRows('ActivityLog').some((a) => a.student_id === '900010' && /DO NOT Consent/.test(a.details)));
  const bytes = state.files[s.vz_pdf_file_id].getBlob()._buf();
  assert.ok(!/mock/.test(bytes.slice(0, 20).toString()), 'the real Verizon form was filled');
  if (process.env.PDF_OUT) require('fs').writeFileSync(process.env.PDF_OUT + '/Decline_VerizonRelease.pdf', bytes);
});
test('the PDF library self-test an Admin runs after installing', async () => {
  const msg = await call(ADMIN, 'pdfSmokeTest');
  assert.strictEqual((msg.match(/: OK, saved/g) || []).length, 3, msg);
});

run();
