/**
 * PdfFill.gs: writes the parent's answers onto the school's own blank PDF
 * forms, so the saved document is the original form with the blanks filled in.
 *
 * The three functions here take the bytes of a blank PDF and return the bytes
 * of the completed PDF. They use no Google services, so they also run in the
 * tests (tests/run-tests.js saves real PDFs you can open).
 *
 * Positions are measured in PDF points from the bottom-left corner of the page
 * (a letter page is 612 x 792). If Digital Promise or Verizon send a new
 * version of a form, re-measure and change the numbers in the tables below.
 */

// pdf-lib waits with setTimeout between steps. Apps Script has no timers and
// the work here is not truly asynchronous, so the callback simply runs at once.
var setTimeout = function (fn) {
  if (typeof fn !== 'function') throw new Error('Access denied.');
  fn();
  return 0;
};

/** Standard PDF fonts only cover Western European characters. Other accents are dropped; other scripts become "?". */
function winAnsi_(s) {
  var ok = /[\x20-\x7E\xA0-\xFF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20AC]/;
  return String(s === null || s === undefined ? '' : s).normalize('NFC').replace(/[\r\n\t]+/g, ' ').split('').map(function (ch) {
    if (ok.test(ch)) return ch;
    // For example a Vietnamese "e" with two accents becomes "e": drop the accent rather than print "?" on a legal form.
    var base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return base && base.split('').every(function (c) { return ok.test(c); }) ? base : '?';
  }).join('');
}

/** Blob bytes from Apps Script are -128..127; PDF code needs 0..255. */
function toUint8_(bytes) {
  return bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes, function (b) { return b & 255; });
}

/** And back again, for Utilities.newBlob. */
function toSignedBytes_(u8) {
  var out = new Array(u8.length);
  for (var i = 0; i < u8.length; i++) out[i] = u8[i] > 127 ? u8[i] - 256 : u8[i];
  return out;
}

/** Draws text that must fit in maxWidth: shrinks the font, then shortens the text. */
function fitText_(page, text, x, y, maxWidth, font, size, color) {
  text = winAnsi_(text);
  if (!text) return;
  var s = size;
  while (s > 6 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  while (text.length > 3 && font.widthOfTextAtSize(text, s) > maxWidth) text = text.substring(0, text.length - 4) + '...';
  page.drawText(text, { x: x, y: y, size: s, font: font, color: color });
}

/** Draws a signature image inside a box, keeping its shape, resting on the bottom-left corner. */
function drawSignature_(page, image, x, y, maxWidth, maxHeight) {
  if (!image) return;
  var scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  page.drawImage(image, { x: x, y: y, width: image.width * scale, height: image.height * scale });
}

/** The small "signed electronically" line in the bottom margin of every page. */
function drawAudit_(doc, font, text, y, x) {
  var gray = PDFLib.rgb(0.3, 0.3, 0.3);
  text = winAnsi_(text);
  var size = 6.5;
  while (size > 4 && font.widthOfTextAtSize(text, size) > 500) size -= 0.25;
  doc.getPages().forEach(function (page) { page.drawText(text, { x: x || 60, y: y, size: size, font: font, color: gray }); });
}

/** Checks a blank form has the expected number of pages, so a wrong file is caught at once. */
function expectPages_(doc, count, label) {
  var n = doc.getPageCount();
  if (n !== count) throw new Error('The ' + label + ' blank form should have ' + count + ' pages (2026-2027 version). This file has ' + n + '.');
}

/* ---------------- Chromebook Checkout Informational Form 2026-2027 (2 pages) ---------------- */

// Everything to fill is on page 2. The price table on page 1 is printed on the
// blank form itself and is left as it is (see DEVICE_MODEL in Config.gs).
var CHECKOUT_LAYOUT_ = {
  studentName: { x: 150, y: 575, width: 220 },
  parentName: { x: 182, y: 561, width: 210 },
  grade: { x: 106, y: 547, width: 180 },
  date: { x: 100, y: 449.5, width: 138 },
  // The signature lines are only 14 points apart, so the signatures are kept short.
  studentSign: { x: 161, y: 435, width: 160, height: 15 },
  parentSign: { x: 197, y: 421, width: 220, height: 13.5 }
};

/** d: {studentName, grade, parentName, signedDate, parentSig, studentSig (PNG bytes), audit} */
async function fillCheckoutPdf_(templateBytes, d) {
  var L = PDFLib, P = CHECKOUT_LAYOUT_;
  var doc = await L.PDFDocument.load(toUint8_(templateBytes));
  expectPages_(doc, 2, 'Chromebook Checkout');
  var page = doc.getPages()[1];
  var font = await doc.embedFont(L.StandardFonts.Helvetica);
  var ink = L.rgb(0.05, 0.1, 0.3);
  function put(spot, text) { fitText_(page, text, spot.x, spot.y, spot.width, font, 10, ink); }
  put(P.studentName, d.studentName);
  put(P.parentName, d.parentName);
  put(P.grade, d.grade);
  put(P.date, d.signedDate);
  if (d.studentSig) drawSignature_(page, await doc.embedPng(toUint8_(d.studentSig)), P.studentSign.x, P.studentSign.y, P.studentSign.width, P.studentSign.height);
  if (d.parentSig) drawSignature_(page, await doc.embedPng(toUint8_(d.parentSig)), P.parentSign.x, P.parentSign.y, P.parentSign.width, P.parentSign.height);
  drawAudit_(doc, font, d.audit, 30, 72);
  return await doc.save();
}

/* ---------------- Check-out record (made on deployment day, no blank form needed) ---------------- */

/**
 * One page that records which Chromebook a student received.
 * d: {school, address, phones, itEmail, campus, rows: [[label, value], ...], note, audit}
 */
async function buildCheckoutRecordPdf_(d) {
  var L = PDFLib;
  var doc = await L.PDFDocument.create();
  var page = doc.addPage([612, 792]);
  var font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
  var black = L.rgb(0, 0, 0), blue = L.rgb(0.07, 0.19, 0.36), gray = L.rgb(0.3, 0.3, 0.3);
  page.drawText(winAnsi_(d.school), { x: 60, y: 720, size: 16, font: bold, color: blue });
  page.drawText(winAnsi_(d.address), { x: 60, y: 704, size: 9, font: font, color: gray });
  page.drawText(winAnsi_(d.phones), { x: 60, y: 692, size: 9, font: font, color: gray });
  page.drawLine({ start: { x: 60, y: 680 }, end: { x: 552, y: 680 }, thickness: 1.5, color: blue });
  page.drawText('Chromebook Check-out Record', { x: 60, y: 650, size: 15, font: bold, color: black });
  var y = 618;
  d.rows.forEach(function (row) {
    page.drawRectangle({ x: 60, y: y - 8, width: 492, height: 24, borderColor: black, borderWidth: 0.75 });
    page.drawLine({ start: { x: 215, y: y - 8 }, end: { x: 215, y: y + 16 }, thickness: 0.75, color: black });
    page.drawText(winAnsi_(row[0]), { x: 66, y: y, size: 10, font: bold, color: black });
    fitText_(page, row[1], 221, y, 325, font, 10, black);
    y -= 24;
  });
  var words = winAnsi_(d.note).split(' '), line = '';
  y -= 14;
  words.forEach(function (w) {
    if (font.widthOfTextAtSize(line + ' ' + w, 10) > 490) { page.drawText(line, { x: 60, y: y, size: 10, font: font, color: black }); y -= 14; line = w; }
    else line = line ? line + ' ' + w : w;
  });
  if (line) page.drawText(line, { x: 60, y: y, size: 10, font: font, color: black });
  page.drawText(winAnsi_('Questions about repairs or replacement: ' + d.itEmail), { x: 60, y: 60, size: 9, font: font, color: gray });
  drawAudit_(doc, font, d.audit, 40, 60);
  return await doc.save();
}


/* ---------------- Digital Promise End User Participation Agreement 2026-2027 (3 pages) ---------------- */

var DP_LAYOUT_ = {
  endUserInIntro: { page: 0, x: 95, y: 549.5, width: 164 },
  participantName: { page: 2, x: 160, y: 712, width: 225 },
  // One blank after each of the nine checklist lines (page 3): where the line starts, its length, and the text baseline.
  initials: [
    { x: 155, y: 584.5, width: 45 }, { x: 136, y: 543.5, width: 63 }, { x: 204, y: 502.5, width: 72 },
    { x: 218, y: 461.5, width: 63 }, { x: 124, y: 420.5, width: 40 }, { x: 330, y: 379.5, width: 54 },
    { x: 144, y: 338.5, width: 68 }, { x: 251, y: 268.5, width: 68 }, { x: 196, y: 227.5, width: 72 }
  ],
  studentSign: { page: 2, x: 158, y: 157, width: 165, height: 22 }, studentDate: { page: 2, x: 352, y: 157, width: 105 },
  parentSign: { page: 2, x: 152, y: 129, width: 175, height: 22 }, parentDate: { page: 2, x: 353, y: 129, width: 105 }
};

/**
 * The student is the End User. Each checklist blank gets both sets of initials,
 * parent first: "RC / LC". The audit line on every page says which is which.
 * d: {studentName, parentName, signedDate, parentInitials, studentInitials,
 *     parentSig, studentSig (PNG bytes), audit}
 */
async function fillDigitalPromisePdf_(templateBytes, d) {
  var L = PDFLib, P = DP_LAYOUT_;
  var doc = await L.PDFDocument.load(toUint8_(templateBytes));
  expectPages_(doc, 3, 'Digital Promise');
  var pages = doc.getPages();
  var font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
  var ink = L.rgb(0.05, 0.1, 0.3);
  function put(spot, text, size, f) { fitText_(pages[spot.page], text, spot.x, spot.y, spot.width, f || font, size || 10, ink); }

  put(P.endUserInIntro, d.studentName, 10.5);
  put(P.participantName, d.studentName);
  var initials = winAnsi_(d.parentInitials) + ' / ' + winAnsi_(d.studentInitials);
  // Long initials may run past the underline into the empty space to its right, rather than be cut short.
  P.initials.forEach(function (spot) { fitText_(pages[2], initials, spot.x, spot.y, Math.max(spot.width, 530 - spot.x), bold, 9, ink); });
  put(P.studentDate, d.signedDate);
  put(P.parentDate, d.signedDate);

  if (d.studentSig) drawSignature_(pages[2], await doc.embedPng(toUint8_(d.studentSig)), P.studentSign.x, P.studentSign.y, P.studentSign.width, P.studentSign.height);
  if (d.parentSig) drawSignature_(pages[2], await doc.embedPng(toUint8_(d.parentSig)), P.parentSign.x, P.parentSign.y, P.parentSign.width, P.parentSign.height);
  drawAudit_(doc, font, d.audit + ' Checklist initials: ' + d.parentInitials + ' (parent/guardian) / ' + d.studentInitials + ' (student).', 40, 72);
  return await doc.save();
}

/* ---------------- VILS Verizon General Release 2026-2027 (2 pages) ---------------- */

var VZ_LAYOUT_ = {
  // Everything is on page 2.
  parentName: { x: 270, y: 587.5, width: 195 },
  studentName: { x: 211, y: 544.5, width: 222 },
  date: { x: 105, y: 502, width: 180 },
  agreeBox: { x: 81, y: 377.25, size: 25.75 },
  declineBox: { x: 81, y: 304.25, size: 25.75 },
  studentSign: { x: 162, y: 269, width: 205, height: 28 },
  parentSign: { x: 157, y: 225.5, width: 220, height: 28 }
};

/** d: {parentName, studentName, signedDate, vzConsent ('agree' or 'decline'), parentSig, studentSig (PNG bytes), audit} */
async function fillVerizonPdf_(templateBytes, d) {
  var L = PDFLib, P = VZ_LAYOUT_;
  var doc = await L.PDFDocument.load(toUint8_(templateBytes));
  expectPages_(doc, 2, 'Verizon General Release');
  var page = doc.getPages()[1];
  var font = await doc.embedFont(L.StandardFonts.Helvetica);
  var ink = L.rgb(0.05, 0.1, 0.3);
  fitText_(page, d.parentName, P.parentName.x, P.parentName.y, P.parentName.width, font, 11, ink);
  fitText_(page, d.studentName, P.studentName.x, P.studentName.y, P.studentName.width, font, 11, ink);
  fitText_(page, d.signedDate, P.date.x, P.date.y, P.date.width, font, 11, ink);
  // An X in the box the parent chose.
  var box = d.vzConsent === 'decline' ? P.declineBox : d.vzConsent === 'agree' ? P.agreeBox : null;
  if (box) {
    var m = 5, a = { x: box.x + m, y: box.y + m }, b = { x: box.x + box.size - m, y: box.y + box.size - m };
    page.drawLine({ start: a, end: b, thickness: 2.2, color: ink });
    page.drawLine({ start: { x: a.x, y: b.y }, end: { x: b.x, y: a.y }, thickness: 2.2, color: ink });
  }
  if (d.studentSig) drawSignature_(page, await doc.embedPng(toUint8_(d.studentSig)), P.studentSign.x, P.studentSign.y, P.studentSign.width, P.studentSign.height);
  if (d.parentSig) drawSignature_(page, await doc.embedPng(toUint8_(d.parentSig)), P.parentSign.x, P.parentSign.y, P.parentSign.width, P.parentSign.height);
  drawAudit_(doc, font, d.audit, 40, 72);
  return await doc.save();
}
