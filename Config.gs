/**
 * Config.gs — data model and default settings.
 *
 * Everything the school may want to change lives in the "Config" tab of the
 * database Sheet. The values below are only the DEFAULTS written by setup();
 * after setup, edit the Config tab (or Settings in the app), not this file.
 *
 * Naming rule used in every file: a function whose name ends with "_" is
 * private. Apps Script lets the browser call ANY other top-level function, so
 * every function without the underscore checks who is calling before it acts.
 */

var ROLE_ADMIN = 'Admin';
var ROLE_IT = 'IT Staff';
var ROLE_HELPER = 'Station Helper';
var ROLES_ALL = [ROLE_ADMIN, ROLE_IT, ROLE_HELPER];
var ROLES_IT = [ROLE_ADMIN, ROLE_IT];
var ROLES_ADMIN = [ROLE_ADMIN];

/** Deployment stages, in order. A student only moves forward through these. */
var STAGES = [
  'Imported', 'Invited', 'Link opened', 'Parent signed', 'Student signed',
  'Outside forms complete', 'Verified at Station 1', 'Chromebook assigned',
  'Verified working', 'Entered in Asset Tiger'
];
/** After-deployment stages. These are set explicitly, in any order. */
var POST_STAGES = [
  'Repair open', 'Loaner issued', 'Lost/Stolen reported', 'Returned',
  'Not returned – records hold'
];

var DEVICE_STATUSES = ['In stock', 'Assigned', 'Loaner', 'In repair', 'Lost', 'Retired'];
var FORM_STATUSES = ['Not started', 'Signed', 'Signed online', 'Verified by staff'];
var REPAIR_STATUSES = ['Open', 'In repair', 'Awaiting payment', 'Closed', 'Cancelled'];
var REPAIR_TYPES = ['repair', 'lost', 'stolen'];

/** One tab per table. setup() creates these tabs and adds any missing column. */
var TABLES = {
  Config: ['key', 'value', 'description'],
  Staff: ['email', 'name', 'role', 'active'],
  Students: [
    'student_id', 'first_name', 'last_name', 'grade', 'dob',
    'parent1_name', 'parent1_email', 'parent1_phone',
    'parent2_name', 'parent2_email', 'parent2_phone', 'language',
    'code', 'link', 'link_active',
    'invite_first_sent', 'reminders_count', 'last_sent', 'link_opened_date',
    'stage', 'stage_date',
    'agreement_id', 'signed_date', 'signer_name', 'signer_phone', 'signer_email', 'signer_address',
    'pg_initials', 's_initials', 'student_folder_id',
    'pdf_file_id', 'pdf_link', 'dp_pdf_file_id', 'vz_pdf_file_id', 'checkout_pdf_file_id',
    'dp_status', 'dp_file_id', 'vz_status', 'vz_file_id', 'vz_consent',
    'station1_date', 'asset_tag', 'working_date', 'notes'
  ],
  Signatures: ['record_id', 'student_id', 'signer_type', 'signer_name', 'signed_at',
    'signature_file_id', 'user_agent'],
  Devices: ['asset_tag', 'serial_number', 'model', 'imei', 'mac', 'mdn', 'iccid',
    'status', 'assigned_student', 'date_assigned', 'notes'],
  Checkouts: ['checkout_id', 'student_id', 'asset_tag', 'staff_email', 'checked_out_at',
    'station', 'type', 'due', 'returned_date', 'asset_tiger_date'],
  Repairs: ['repair_id', 'student_id', 'asset_tag', 'serial_number', 'mdn', 'imei', 'iccid',
    'mac', 'type', 'description', 'repair', 'replacement', 'cost', 'repair_number',
    'school_share', 'student_share', 'status', 'opened_date', 'closed_date',
    'reported_by', 'paid'],
  ActivityLog: ['timestamp', 'user_email', 'student_id', 'action', 'details'],
  MailQueue: ['student_id', 'kind', 'queued_at', 'queued_by']
};

/** CSV template columns for the student import (dob is optional). */
var STUDENT_IMPORT_FIELDS = ['student_id', 'student_first_name', 'student_last_name', 'grade',
  'parent1_name', 'parent1_email', 'parent1_phone', 'parent2_name', 'parent2_email',
  'parent2_phone', 'preferred_language', 'date_of_birth'];

var INVITE_BODY_EN_ = [
  'Dear Parent/Guardian,', '',
  '{{student_name}} (grade {{grade}}) will receive a take-home Chromebook through the Verizon Innovative Learning Schools program at {{school}}.', '',
  'Before we can issue the Chromebook, please review and sign the Chromebook Checkout agreement online. It takes about 5 minutes and works on a phone. Your student signs on the same screen after you.', '',
  'Sign here: {{link}}', '',
  'This link is personal to your student. Please do not share it.', '',
  'Questions? Contact {{it_email}}.', '',
  'Thank you,', '{{school}} Information Technology Department'
].join('\n');

var INVITE_BODY_ES_ = [
  'Estimado padre, madre o tutor:', '',
  '{{student_name}} (grado {{grade}}) recibirá una Chromebook para llevar a casa a través del programa Verizon Innovative Learning Schools en {{school}}.', '',
  'Antes de entregar la Chromebook, por favor revise y firme en línea el acuerdo de préstamo de Chromebook. Toma unos 5 minutos y funciona en un teléfono. Su estudiante firma en la misma pantalla después de usted.', '',
  'Firme aquí: {{link}}', '',
  'Este enlace es personal para su estudiante. Por favor no lo comparta.', '',
  '¿Preguntas? Escriba a {{it_email}}.', '',
  'Gracias,', 'Departamento de Tecnología de la Información de {{school}}'
].join('\n');

var REMINDER_BODY_EN_ = [
  'Dear Parent/Guardian,', '',
  'This is a reminder that the Chromebook Checkout agreement for {{student_name}} (grade {{grade}}) has not been signed yet. We cannot issue a Chromebook until it is signed.', '',
  'Sign here: {{link}}', '',
  'Questions? Contact {{it_email}}.', '',
  'Thank you,', '{{school}} Information Technology Department'
].join('\n');

var REMINDER_BODY_ES_ = [
  'Estimado padre, madre o tutor:', '',
  'Le recordamos que el acuerdo de préstamo de Chromebook para {{student_name}} (grado {{grade}}) aún no ha sido firmado. No podemos entregar la Chromebook hasta que esté firmado.', '',
  'Firme aquí: {{link}}', '',
  '¿Preguntas? Escriba a {{it_email}}.', '',
  'Gracias,', 'Departamento de Tecnología de la Información de {{school}}'
].join('\n');

var RECEIPT_BODY_EN_ = [
  'Dear {{parent_name}},', '',
  'Thank you. The Chromebook Checkout agreement for {{student_name}} (grade {{grade}}) was signed on {{signed_date}}. A copy is attached for your records.', '',
  'Questions? Contact {{it_email}}.', '',
  '{{school}} Information Technology Department'
].join('\n');

var RECEIPT_BODY_ES_ = [
  'Estimado/a {{parent_name}}:', '',
  'Gracias. El acuerdo de préstamo de Chromebook para {{student_name}} (grado {{grade}}) fue firmado el {{signed_date}}. Se adjunta una copia para sus archivos.', '',
  '¿Preguntas? Escriba a {{it_email}}.', '',
  'Departamento de Tecnología de la Información de {{school}}'
].join('\n');

/** [key, default value, description]. Written to the Config tab by setup(). */
var DEFAULT_CONFIG = [
  ['SCHOOL_NAME', 'Albuquerque School of Excellence', 'School name used in pages, emails and the PDF.'],
  ['SCHOOL_ADDRESS', '13201 Lomas Blvd. NE, Albuquerque, New Mexico 87112', 'PDF and page header.'],
  ['SCHOOL_PHONES', 'Elementary | 505.355.5895     Mid/High | 505.312.7711', 'PDF and page header.'],
  ['CAMPUS', 'ASE West', 'Campus label shown to staff.'],
  ['SCHOOL_YEAR', '2026-2027', 'Used in the Drive folder name "Chromebook Agreements [School Year]".'],
  ['DEPLOYMENT_DATE', 'October 2026', 'Shown on the staff overview. Free text.'],
  ['ALLOWED_DOMAIN', 'abqse.org', 'Only staff accounts on this domain may sign in.'],
  ['IT_EMAIL', 'itsupport@abqse.org', 'IT contact shown to parents; also receives problem, repair and lost reports.'],
  ['DEVICE_MODEL', 'CTL PX112CT-L | Dell 3100/3110', 'Chromebook models in the price table parents see on screen, with a bar between them. Give one price per model the same way in each COST row. The signed PDF shows the price table printed on the blank Chromebook Checkout form, so if prices change, change them here AND upload an updated blank form.'],
  ['GRADE_MIN', '5', 'Lowest grade accepted by the student import.'],
  ['GRADE_MAX', '12', 'Highest grade accepted by the student import.'],
  ['PARENT_APP_URL', '', 'Web app URL of the PARENT deployment (access: Anyone). Parent links are built from this. Ends in /exec.'],
  ['STAFF_APP_URL', '', 'Web app URL of the STAFF deployment (access: Anyone within the school domain). Ends in /exec.'],
  ['DRIVE_FOLDER_ID', '', 'ID of the folder inside the school Shared Drive where PDFs are saved.'],
  ['SIGN_FORMS_ONLINE', 'Y', 'Y = parents also complete the Digital Promise agreement and the Verizon General Release in the app, in the same sitting. N = those two are handled outside the app (see OUTSIDE_FORMS_METHOD).'],
  ['CHECKOUT_TEMPLATE_FILE_ID', '', 'Drive file ID of the blank Chromebook Checkout Informational Form 2026-2027 PDF (2 pages). The signed copy is this file with the blanks filled in.'],
  ['DP_TEMPLATE_FILE_ID', '', 'Drive file ID of the blank Digital Promise End User Participation Agreement for 2026-2027 PDF (3 pages).'],
  ['VZ_TEMPLATE_FILE_ID', '', 'Drive file ID of the blank VILS Verizon General Release Form for 2026-2027 PDF (2 pages).'],
  ['LOGO_FILE_ID', '', 'Not used when the blank Chromebook Checkout PDF is set, because that file already has the logos.'],
  ['POLICY_URL', '', 'Link to the Chromebook Policy shown to parents.'],
  ['DP_FORM_URL', '', 'Optional link to the Digital Promise End User Participation Agreement (blank form or online form).'],
  ['VZ_FORM_URL', '', 'Optional link to the Verizon General Release (blank form or online form).'],
  ['OUTSIDE_FORMS_METHOD', 'staff', '"staff" = staff marks the outside forms as received/verified. "upload" = parent uploads a signed copy or photo.'],
  ['OUTSIDE_FORMS_REQUIRE_STAFF_VERIFY', 'Y', 'Y = an outside form only counts once staff verified it. N = a parent upload/confirmation is enough.'],
  ['VERIZON_REQUIRED', 'N', 'Y = the Verizon General Release is also required before a device is issued. The Digital Promise agreement is always required.'],
  ['HELPERS_CAN_VERIFY_FORMS', 'N', 'Y = Station Helpers may mark a paper outside form as received at Station 1.'],
  ['IT_STAFF_SEE_CONTACT', 'N', 'Y = IT Staff can also see parent phone/email. Admins always can.'],
  ['LOANER_DUE_TIME', '16:00', 'Time of day (24h) when a loaner is due back.'],
  ['CLAIMS_THRESHOLD_PCT', '20', 'VILS claims-rate threshold (percent).'],
  ['CLAIMS_WARN_PCT', '15', 'Show a warning when the claims rate reaches this percent.'],
  ['MAIL_BATCH_SIZE', '10', 'Students emailed per batch when sending invitations.'],
  ['AT_GROUP_ELEMENTARY', 'Elementary Student', 'Asset Tiger assignment for grade 5.'],
  ['AT_GROUP_SECONDARY', 'Secondary Student', 'Asset Tiger assignment for grades 6-12.'],
  ['COST: Chromebook Replacement', '645.00 | 350.00', 'Repair/replacement cost table, one price per model in DEVICE_MODEL. Add, remove or reprice rows that start with "COST: ".'],
  ['COST: Touch Panel/Screen', '99.00 | 25.00', ''],
  ['COST: Keyboard', '59.00 | 20.00', ''],
  ['COST: Touchpad', '35.00 | 12.00', ''],
  ['COST: AC Adapter', '22.80 | 35.00', ''],
  ['COST: Motherboard', '175.00 | 220.00', ''],
  ['COST: Battery', '49.99 | 45.00', ''],
  ['SHARE: 1st Repair', '100/0', 'Cost sharing as "school percent/student percent". The last SHARE row applies to every later repair.'],
  ['SHARE: 2nd Repair', '50/50', ''],
  ['SHARE: 3rd Repair', '20/80', ''],
  ['SHARE: 4th Repair and beyond', '0/100', ''],
  ['EMAIL_INVITE_SUBJECT_EN', 'Action needed: sign the Chromebook agreement for {{student_first_name}}', 'Placeholders: {{student_name}} {{student_first_name}} {{grade}} {{link}} {{school}} {{it_email}}'],
  ['EMAIL_INVITE_BODY_EN', INVITE_BODY_EN_, ''],
  ['EMAIL_INVITE_SUBJECT_ES', 'Acción necesaria: firme el acuerdo de Chromebook de {{student_first_name}}', ''],
  ['EMAIL_INVITE_BODY_ES', INVITE_BODY_ES_, ''],
  ['EMAIL_REMINDER_SUBJECT_EN', 'Reminder: Chromebook agreement for {{student_first_name}} is not signed yet', ''],
  ['EMAIL_REMINDER_BODY_EN', REMINDER_BODY_EN_, ''],
  ['EMAIL_REMINDER_SUBJECT_ES', 'Recordatorio: falta firmar el acuerdo de Chromebook de {{student_first_name}}', ''],
  ['EMAIL_REMINDER_BODY_ES', REMINDER_BODY_ES_, ''],
  ['EMAIL_RECEIPT_SUBJECT_EN', 'Signed Chromebook agreement for {{student_name}}', 'Extra placeholders: {{parent_name}} {{signed_date}}'],
  ['EMAIL_RECEIPT_BODY_EN', RECEIPT_BODY_EN_, ''],
  ['EMAIL_RECEIPT_SUBJECT_ES', 'Acuerdo de Chromebook firmado de {{student_name}}', ''],
  ['EMAIL_RECEIPT_BODY_ES', RECEIPT_BODY_ES_, '']
];

var CONFIG_CACHE_ = null;

/** Returns all settings as {key: value}; Config tab values override the defaults. */
function getConfig_() {
  if (CONFIG_CACHE_) return CONFIG_CACHE_;
  var cfg = {};
  DEFAULT_CONFIG.forEach(function (d) { cfg[d[0]] = d[1]; });
  var costs = [], shares = [], fromSheet = false;
  try {
    var rows = configRows_();
    fromSheet = true;
    rows.forEach(function (r) {
      if (!r.key) return;
      cfg[r.key] = r.value;
      if (r.key.indexOf('COST: ') === 0) costs.push(costRow_(r.key.substring(6).trim(), r.value));
      if (r.key.indexOf('SHARE: ') === 0) shares.push(parseShare_(r.key.substring(7).trim(), r.value));
    });
  } catch (e) { /* before setup(): fall through to defaults */ }
  if (!fromSheet) {
    DEFAULT_CONFIG.forEach(function (d) {
      if (d[0].indexOf('COST: ') === 0) costs.push(costRow_(d[0].substring(6), d[1]));
      if (d[0].indexOf('SHARE: ') === 0) shares.push(parseShare_(d[0].substring(7), d[1]));
    });
  }
  cfg._costs = costs;
  cfg._models = String(cfg.DEVICE_MODEL || '').split('|').map(function (m) { return m.trim(); }).filter(String);
  cfg._shares = shares;
  CONFIG_CACHE_ = cfg;
  return cfg;
}

/**
 * The Config rows. Read from the Sheet at most every two minutes; in between
 * they come from Google's cache, which is much faster than opening the Sheet.
 * A change made in the app clears the cache at once. A change typed straight
 * into the Config tab takes up to two minutes to be picked up.
 */
function configRows_() {
  var cache = CacheService.getScriptCache();
  try {
    var hit = cache.get('config:v1');
    if (hit) return JSON.parse(hit);
  } catch (e) { /* read the Sheet instead */ }
  var rows = table_('Config').rows.map(function (r) { return { key: r.key, value: r.value }; });
  try { cache.put('config:v1', JSON.stringify(rows), 120); } catch (e) { /* too large or unavailable: no cache */ }
  return rows;
}

function forgetCached_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (e) { /* nothing to forget */ }
}

/** A price row. One price per Chromebook model, separated by a bar: "389.00 | 350.00". */
function costRow_(name, value) {
  var list = String(value || '').split('|').map(function (v) { return parseFloat(v) || 0; });
  return { name: name, cost: list[0] || 0, costs: list };
}

/** Writes one setting to the Config tab (adds the row if it is missing). */
function setConfig_(key, value) {
  withLock_(function () {
    var row = find_('Config', 'key', key);
    if (row) update_('Config', 'key', key, { value: value });
    else insert_('Config', [{ key: key, value: value, description: '' }]);
  });
  CONFIG_CACHE_ = null;
  forgetCached_('config:v1');
}

/**
 * Parent link for a code. Empty until PARENT_APP_URL is set: guessing the URL
 * could hand families the staff link, which makes them sign in to Google.
 */
function linkFor_(code) {
  var base = getConfig_().PARENT_APP_URL;
  return base ? base + '?code=' + code : '';
}
