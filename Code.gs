/**
 * Code.gs — web app entry point and page routing.
 *
 *   .../exec?code=XXXX   parent signing page for one student (no login)
 *   .../exec?page=find   backup: find a student by ID + date of birth
 *   .../exec?page=repair Student Chromebook Repair Request (school account)
 *   .../exec?page=lost   Student Chromebook Lost/Stolen Report (school account)
 *   .../exec             staff app (school account listed in the Staff tab)
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var code = String(p.code || '');
  var page = String(p.page || '');
  var cfg = getConfig_();
  var common = {
    school: cfg.SCHOOL_NAME, address: cfg.SCHOOL_ADDRESS, phones: cfg.SCHOOL_PHONES,
    itEmail: cfg.IT_EMAIL
  };

  if (code || page === 'find') {
    common.mode = code ? 'sign' : 'find';
    common.code = /^[A-Za-z0-9]{8,40}$/.test(code) ? code : '';
    common.str = STR_;
    common.terms = TERMS_ES_;
    if (common.code) { try { common.initial = apiParentLoad(common.code); } catch (e) { /* the page asks again itself */ } }
    return renderPage_('Parent', common, cfg.SCHOOL_NAME + ' – Chromebook Checkout');
  }

  if (page === 'repair' || page === 'lost') {
    var email = currentEmail_();
    var domain = String(cfg.ALLOWED_DOMAIN || '').toLowerCase();
    if (!email || email.split('@')[1] !== domain) {
      common.reason = 'school';
      return renderPage_('Denied', common, 'Sign in required');
    }
    common.mode = page;
    return renderPage_('Report', common, page === 'lost' ? 'Chromebook Lost/Stolen Report' : 'Chromebook Repair Request');
  }

  var staff = currentStaff_();
  if (!staff) {
    common.reason = 'staff';
    common.signedIn = !!currentEmail_();
    return renderPage_('Denied', common, cfg.SCHOOL_NAME + ' – Chromebooks');
  }
  // The page carries its start-up data, so the browser does not have to ask for it separately.
  var page = { boot: bootData_(staff) };
  if (staff.role !== ROLE_HELPER) { try { page.home = apiHome(); } catch (e) { /* the page asks for it itself */ } }
  return renderPage_('Staff', page, 'ASE Chromebooks');
}

/**
 * Builds a page from an .html file. `boot` is passed to the page as JSON; "<"
 * is escaped so data can never close the script tag.
 */
function renderPage_(file, boot, title) {
  var t = HtmlService.createTemplateFromFile(file);
  t.boot = JSON.stringify(boot).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  return t.evaluate().setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Lets one .html file include another (shared styles and scripts). */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
