# ASE Chromebook Agreement & Checkout App

A Google Apps Script web app for Albuquerque School of Excellence (ASE West, VILS program). Parents sign the Chromebook Checkout agreement online, the signed PDF is saved to the school Shared Drive, and IT staff and volunteers check out Chromebooks at three stations. Every step is tracked from invitation to return.

All data stays inside the school's Google Workspace: a Google Sheet is the database, Drive holds the PDFs, Gmail sends the mail. No outside service is used (signatures are drawn in the browser; QR codes are generated in the browser with a bundled open-source library).

## Start here

| I want to | Read |
|---|---|
| Install it | [docs/INSTALL.md](docs/INSTALL.md) |
| Learn how to use it (Admin, IT Staff, Station Helper, parents EN/ES) | [docs/USER-GUIDE.md](docs/USER-GUIDE.md) |
| Test it end to end | [docs/TEST-CHECKLIST.md](docs/TEST-CHECKLIST.md) |
| Try it on my computer first | `node tests/local-server.js` (needs Node.js; fake data, nothing sent) |

## Files

| File | What it does |
|---|---|
| `appsscript.json` | Project settings and permissions |
| `Code.gs` | Entry point: decides which page to show |
| `Config.gs` | Table/column definitions and default settings (prices, email text and so on) |
| `Setup.gs` | `setup()` and `loadSampleData()` |
| `Db.gs` | Reading/writing the Sheet with locking |
| `Auth.gs` | Roles, staff list, settings |
| `Util.gs` | CSV parsing, validation, cost sharing, file names |
| `I18n.gs` | Parent-facing text in English and Spanish |
| `Students.gs` | Import, add/edit, list, detail, stages, outside forms |
| `Mail.gs` | Invitations, reminders, receipts, daily-limit queue |
| `Signing.gs` | Parent/student signing of all three forms |
| `DocText.gs` | The wording of the Digital Promise and Verizon forms, shown on screen |
| `Pdf.gs` | Saving the signed PDFs in one folder per student |
| `PdfFill.gs` | Writes the answers onto the school's blank PDF forms |
| `PdfLib.gs` | Open-source PDF library (pdf-lib, MIT). Do not edit |
| `Stations.gs` | Station 1, 2, 3 |
| `Devices.gs` | Inventory, device import, Asset Tiger export, inventory report |
| `Repairs.gs` | Repairs, lost/stolen, loaners, returns |
| `Reports.gs` | Home summary, progress by grade, missing forms, claims rate, QR letters |
| `Parent.html` | Parent signing page |
| `Staff.html` | Staff app page |
| `StaffCore.html` | Menu, Home to-do list, student list and student page, sending links |
| `StaffOps.html` | The single deployment screen, Chromebooks, repairs, loaners, reports |
| `StaffAdmin.html` | Importing lists and Settings (Admin) |
| `Report.html` | Student repair request / lost report forms |
| `Denied.html` | Page shown to visitors without access |
| `Styles.html`, `ClientCore.html`, `QrLib.html` | Shared styles, helpers, QR library (MIT) |
| `templates/` | The blank PDF forms the school supplied. Upload three of them to Drive (install guide, Step 4b) |
| `samples/` | 10 fake students and 10 fake devices as CSV |
| `tests/` | Automatic tests and local preview (not uploaded to Google) |

## Decisions made where the request left room

These can all be changed; most are settings.

- **Three forms in one sitting.** The parent form covers the Chromebook Checkout form, the Digital Promise agreement and the Verizon General Release. Nothing is saved unless all three are complete. Each is saved as the school's own blank PDF with the blanks filled in.
- **2026-2027 forms.** The three blank forms in `templates` are the 2026-2027 versions (Chromebook Checkout Informational Form, Digital Promise End User Participation Agreement, VILS Verizon General Release). The previous versions are kept in `templates/old_2025` and are not used.
- **Digital Promise: the student is the End User.** The student's name goes in the End User blank and the Participant Name. The form has one initial blank per line; parent and student both type initials and tick every line, and the PDF shows both as "parent / student" (for example `RC / LC`). The "Signed electronically" line says which is which. Both sign.
- **Verizon General Release: Agree or DO NOT Consent.** The parent picks one of the form's two boxes; either answer completes the form, and the answer is stored in `vz_consent`. A "DO NOT Consent" shows as a warning on the student page so staff know Verizon may not photograph that student. Parent and student both sign. Its wording is still written for an adult ("I am of full age"); confirm with Verizon that this is fine for students.
- **No mailing address.** None of the 2026-2027 forms asks for one, so the parent page no longer does. Phone and email are still asked for (the receipt email needs them) but are not printed on the forms.
- **One drawn signature each, typed initials.** The parent and the student each sign once and are told the signature goes on all three documents. Initials are typed and each line is ticked. Confirm both partners accept this.
- **Price table.** The 2026-2027 checkout form prints its own price table for two models (CTL PX112CT-L and Dell 3100/3110). The signed PDF keeps that table as printed; the Settings defaults list the same two models and prices for the screen. If prices change, update both Settings and the blank form. A lost/stolen record is pre-filled with the replacement price for that device's model.
- **Families download their forms.** The Thank you screen offers each signed PDF for download, byte for byte the file saved in Drive, and the personal link keeps offering them for one hour after signing. After that the link only says "already signed"; the emailed copies remain. Each download from the link is recorded in the student's history.
- **One folder per student** inside each grade folder, holding the three PDFs, the signature images and any replaced copies.
- **Two web links from one project** (staff: school domain only; parents: anyone with a valid code), because Apps Script sets access per deployment.
- **`date_of_birth`** was added as an optional import column. The "lost my link" lookup (student ID + birth date) needs it and the original column list had none.
- **Outside forms.** Digital Promise is always required before a check-out; Verizon is tracked and can be made required (`VERIZON_REQUIRED`). By default a parent's "I already signed it" or upload shows as "needs checking by staff" and counts only after staff verify it (`OUTSIDE_FORMS_REQUIRE_STAFF_VERIFY`).
- **IT Staff do not see parent contact details** by default (`IT_STAFF_SEE_CONTACT`), following the role table.
- **PDFs are opened through the app**, not through Drive links, so the Drive folder can stay Admin-only and every view is logged.
- **Repair numbering** counts all of a student's repairs, not per school year. **Lost/stolen** records are pre-filled with the replacement cost, but the school/student split is typed in by IT, because the cost-sharing table only covers repairs.
- **Claims rate** = repair + lost + stolen records opened in the last two years ÷ devices not retired. Confirm this matches the VILS definition.
- **One deployment screen.** Staff search for the student and the screen shows the next step (sign, hand in a form, check forms, assign, check it works). The three stations in the plan still work: each station uses the same screen. The server enforces the forms rule strictly; a skipped forms check is only noted in the history.
- **Plain status sentences.** Screens show sentences such as "Signed. Digital Promise form is missing". The stage names from the brief are still what is stored in the Sheet and the history, and can be picked in the Students filter under "Exact step".
- **Student repair/lost forms** ask for student ID + last name (school sign-in required) instead of a name list, so one student cannot browse the roster.
- **The agreement and the check-out are two documents.** The 2026-2027 Chromebook Checkout form has no staff block, so that document is final once signed and is never remade. When a Chromebook is assigned, the app saves a separate one-page check-out record (student, asset tag, serial number, who handed it over, date) in the same student folder. The file names are `..._ChromebookAgreement.pdf` and `..._CheckoutRecord_[AssetTag].pdf`, replacing the single `[AssetTag or PENDING]` name in the brief. The check-out record is not signed by the student or parent.
- **IP address** cannot be read in Apps Script; browser type and time are recorded instead.

## What has and has not been verified

Verified on a development machine against a stand-in for Google's services: the 47 automatic tests (`node tests/run-tests.js`, including a 1,500-student load check) and a click-through of every screen in a real browser, including signing on a phone-sized screen.

The three PDFs were produced from the real 2026-2027 blank forms on the development machine and checked by eye, including a "DO NOT Consent" Verizon form and a full sign-and-submit on a phone-sized screen in the local preview.

Not yet verified, because it needs the school's Google account: the real deployment, whether the PDF library runs inside Apps Script (run `pdfSmokeTest` first; a plain version is saved if it does not), real Gmail delivery and limits, Shared Drive permissions, and camera barcode scanning inside the Apps Script page. `docs/TEST-CHECKLIST.md` covers each of these.
