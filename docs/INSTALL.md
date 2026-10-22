# Installation guide (no coding needed)

Time: about 45 minutes. Do every step signed in as the **school IT account** that will own the app (a shared IT account is better than a personal one, because the app keeps running as that account).

You will end up with:

- one Google Sheet (the database),
- one Apps Script project (the app) attached to that Sheet,
- one folder in a school Shared Drive (signed PDFs),
- two web links: one for **staff**, one for **parents**.

---

## Step 1 – Create the database Sheet

1. Go to [sheets.new](https://sheets.new). Name it **ASE Chromebook App Database**.
2. Click **Extensions → Apps Script**. A new tab opens. Name the project **ASE Chromebook App**.

## Step 2 – Add the code

In the Apps Script editor:

1. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**.
2. Go back to the **Editor** (the `< >` icon). Open `appsscript.json`, delete what is there, and paste the contents of this project's `appsscript.json`.
3. Delete the starter file `Code.gs` content, then for every file below create a file with the same name and paste its contents:
   - **Script files** (click **+ → Script**; type the name *without* `.gs`):
     `Code`, `Config`, `Util`, `Db`, `Auth`, `Setup`, `I18n`, `DocText`, `Students`, `Mail`, `Signing`, `Pdf`, `PdfFill`, `PdfLib`, `Stations`, `Devices`, `Repairs`, `Reports`
     (`PdfLib` is a large file, about half a megabyte. Pasting works but the editor may freeze for a while. If it does not finish, use the clasp method below for this file.)
   - **HTML files** (click **+ → HTML**; type the name *without* `.html`):
     `Styles`, `ClientCore`, `QrLib`, `Parent`, `Staff`, `StaffCore`, `StaffOps`, `StaffAdmin`, `Report`, `Denied`
4. Click the **Save** icon.

Names must match exactly, including capital letters. Do not upload the `tests`, `docs` or `samples` folders.

> **Faster way for someone comfortable with a terminal:** install Node.js, run `npm install -g @google/clasp`, `clasp login`, then in this folder `clasp clone <scriptId>` (Script ID is under Project Settings) and `clasp push`. The `.claspignore` file already leaves out tests and docs.

## Step 3 – Run setup

1. In the editor's toolbar, choose the function **setup** in the drop-down and click **Run**.
2. Google asks for permission. Click **Review permissions → choose the IT account → Allow**. The app asks to: edit Sheets, use Drive, send email as you, and run when you are not present (for the next-morning email resume).
3. Open **Execution log** at the bottom. It should say `Setup finished.`

Go back to the Sheet: it now has the tabs Config, Staff, Students, Signatures, Devices, Checkouts, Repairs, ActivityLog and MailQueue. Your account is in **Staff** as **Admin**.

Running `setup` again later is safe. It only adds what is missing.

## Step 4 – Connect the Shared Drive folder

1. In Google Drive open the school **Shared Drive** (create one if needed, for example *IT – Chromebook Program*). The IT account must be a **Content manager** or **Manager** of it.
2. Create a folder, for example **Chromebook App**.
3. Open the folder and copy the ID from the address bar: the long text after `/folders/`.
4. In the Sheet's **Config** tab, paste it in the **value** column of the row `DRIVE_FOLDER_ID`.
5. Setup created a temporary folder in My Drive called *ASE Chromebook App Files (move me to the Shared Drive)*. Delete it.

The app creates `Chromebook Agreements 2026-2027/Grade N/` inside your folder by itself.

## Step 4b – Upload the three blank forms

The signed PDFs are your own blank forms with the blanks filled in, so the app needs the blank files.

1. In the Shared Drive folder from Step 4, create a folder called **Blank forms**.
2. Upload these three files from this project's `templates` folder:
   - `Chromebook_Checkout_blank.pdf`
   - `Digital_Promise_Agreement_blank.pdf`
   - `Verizon_General_Release_blank.pdf`
3. For each file: right-click, **Share, Copy link**. The file ID is the long text between `/d/` and `/view`.
4. In the **Config** tab paste the three IDs into `CHECKOUT_TEMPLATE_FILE_ID`, `DP_TEMPLATE_FILE_ID` and `VZ_TEMPLATE_FILE_ID`.
5. After Step 5 (when the staff link works), open the app, go to **Settings, Technical** and press **Test the PDF forms**. The result should show three lines ending in `OK`. (You can also run the function **pdfSmokeTest** from the script editor, but the button is the better test because it also proves that the answer reaches the browser.)
6. In Drive open `Chromebook Agreements 2026-2027 / _pdf_test` and look at the three test PDFs. The made-up names, initials, the Verizon X and a small squiggle should sit in the right places on each form. Delete the `_pdf_test` folder afterwards.

**Do this test before anything else depends on it.** It is the one part that could only be checked on a development computer, not inside Google. If a line says `FAILED`, the app still works: it saves a plain version of that form instead, and notes it in the student's history. Send the message from the log to whoever maintains the code.

Use the file names above only as a guide. What matters is that each file is the **2026-2027** version: Chromebook Checkout Informational Form (2 pages), Digital Promise End User Participation Agreement (3 pages) and VILS Verizon General Release (2 pages). The older forms are kept in `templates/old_2025` for reference and are not used. If a form with a different number of pages is set, the app says so and saves a plain copy instead.

The price table on the signed Chromebook Checkout PDF is the one printed on the blank form. Parents see the prices from Settings on screen, so keep the two the same: if prices change, change them in Settings **and** upload an updated blank form.

## Step 5 – Deploy the two web links

The same code is deployed twice, because staff and parents need different access.

**Staff link**

1. In the Apps Script editor click **Deploy → New deployment**.
2. Click the gear next to *Select type* and choose **Web app**.
3. Description: `Staff`. **Execute as: Me**. **Who has access: Anyone within abqse.org** (your domain name appears here).
4. Click **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Paste it in Config → `STAFF_APP_URL`.

**Parent link**

1. **Deploy → New deployment → Web app** again.
2. Description: `Parents`. **Execute as: Me**. **Who has access: Anyone**.
3. Deploy, copy the URL, paste it in Config → `PARENT_APP_URL`.

Why this is safe: the parent link only shows a signing page to someone holding a valid random code. Every staff function checks that the visitor is signed in with a school account listed in the **Staff** tab; a parent (or anyone else) who opens the plain link sees only a "use your personal link" page.

> If the option **Anyone** is missing in step 2, your Google Admin has blocked sharing outside the school. See Step 7.

## Step 6 – Lock down the Sheet and the Drive folder

- Share the **Sheet** only with the Admins (IT Manager, IT lead). Nobody else needs it; everyone else works through the app.
- Give access to the **Shared Drive folder** only to Admins.
- Do **not** share the Apps Script project with volunteers or students.

## Step 7 – Google Admin console settings (ask your Workspace super admin)

These are only needed if something above was blocked.

| Symptom | Setting to check in admin.google.com |
|---|---|
| "Apps Script is disabled" or you cannot open the editor | **Apps → Additional Google services → Google Apps Script**: ON for the IT account's organizational unit |
| The permission screen says the app is blocked | **Security → Access and data control → API controls**: allow internal, domain-owned apps / trust the project |
| **Who has access: Anyone** is not offered | **Apps → Google Workspace → Drive and Docs → Sharing settings**: the IT account's organizational unit must be allowed to share outside the organization ("Anyone with the link") |
| Parents see a Google sign-in page instead of the form | Same as above; also confirm you used the **Parents** deployment URL in `PARENT_APP_URL` |
| Staff see "not on the staff list" | Add their `@abqse.org` email in the app: **Settings, People, Add a person** |

## Step 8 – Fill in the remaining settings

In the app under **Settings** (the tabs School, Prices, Emails, Other forms and Technical show these in plain words), or directly in the **Config** tab of the Sheet:

| Setting | What to enter |
|---|---|
| `SCHOOL_YEAR` | For example `2026-2027` (used in the folder name) |
| `SIGN_FORMS_ONLINE` | `Y` = parents also complete the Digital Promise agreement and the Verizon release in the app. `N` = those two are handled on paper |
| `DEVICE_MODEL` and rows starting `COST: ` | The model name and prices in the price table. They are printed on the signed PDF, replacing the table on the blank form |
| `POLICY_URL` | Link to the Chromebook Policy |
| `DP_FORM_URL`, `VZ_FORM_URL` | Optional links to the Digital Promise and Verizon forms |
| `OUTSIDE_FORMS_METHOD` | `staff` (staff marks the form as received) or `upload` (parent uploads a photo/PDF) |
| `OUTSIDE_FORMS_REQUIRE_STAFF_VERIFY` | `Y` = a form only counts after staff verified it |
| `VERIZON_REQUIRED` | `Y` if the Verizon release must also block a check-out |
| Rows starting `COST: ` | Repair prices. Change the number; add or remove rows that start with `COST: ` |
| Rows starting `EMAIL_` | The invitation, reminder and receipt text, English and Spanish |

## Step 9 – Test with the sample data

1. In the editor choose the function **loadSampleData** and click **Run**. It adds 10 fake students and 10 fake devices (all emails are `@example.com`, so no real family gets mail).
2. Open the **staff link** and follow `docs/TEST-CHECKLIST.md`. To receive the test emails yourself, open a sample student, choose More actions, Edit student and parent details, and put your own email as Parent 1.
3. When finished, delete the sample rows from the Students, Devices, Signatures, Checkouts, Repairs and ActivityLog tabs (keep row 1, the headers), and delete the test PDFs from the Drive folder.

## Before you go live

- [ ] **Test the PDF forms** showed three `OK` lines and the three test PDFs look right (Step 4b). Home shows no red note about blank forms.
- [ ] Sign once as a test family and open the three PDFs in the student's folder. Check every blank: names, grade, dates, both sets of initials on all nine lines, the Verizon X, and the signatures.
- [ ] Digital Promise and Verizon have confirmed in writing that they accept these forms signed this way, with one drawn signature placed on each document and typed initials.
- [ ] A native Spanish speaker at the school has reviewed the Spanish text (`I18n.gs` and the Spanish emails under Settings, Emails).
- [ ] `DRIVE_FOLDER_ID` points to the **Shared Drive** folder, not My Drive.
- [ ] Both URLs are in Config, and a parent link opens on a phone that is **not** signed in to a school account.
- [ ] Try the barcode scanner (and the camera button on the station tablets; it only appears where the browser supports it).
- [ ] Station Helper accounts added under Settings, People, then switched off until deployment day.

## Updating the app later

After changing code: **Deploy → Manage deployments →** pick *Staff* → pencil icon → Version: **New version** → Deploy. Repeat for *Parents*. The links stay the same. (Creating a *new deployment* instead would change the link and break the emails already sent.)

Each time, before pressing Deploy, **check "Who has access"**: *Staff* must still say *Anyone within abqse.org* and *Parents* must still say *Anyone*. Then open one parent link in a private/incognito window. If it asks for a Google sign-in, the Parents deployment has the wrong access and every family would be stuck.

## Good to know

- **Email limits.** Google limits how many recipients one account can email per day. The app reads the real remaining number, shows it on the Home page, and queues the rest for the next morning automatically.
- **Who is "the app"?** The app runs as the IT account that deployed it: emails are sent from it and files are created by it. Do not delete or suspend that account.
- **Where the PDFs go.** `Chromebook Agreements [year] / Grade N / LastName_FirstName_StudentID /` holds that student's three signed PDFs (`..._ChromebookAgreement.pdf`, `..._DigitalPromise.pdf`, `..._VerizonRelease.pdf`), the check-out record added on deployment day (`..._CheckoutRecord_[AssetTag].pdf`), a `_signatures` folder with the drawn signatures, and a `_previous` folder if a copy was ever replaced.
- **If a partner sends a new version of a form.** Replace the blank PDF in Drive, update the wording in `DocText.gs`, and have a developer re-measure the positions in `PdfFill.gs`. Run `pdfSmokeTest` again.
- **Edits typed straight into the Sheet take a moment.** To keep the app quick, the settings and the staff list are remembered for a short time. A change made inside the app applies at once. A change typed directly into the Config tab takes up to two minutes, and one typed into the Staff tab up to one minute.
- **IP addresses** are not available to Apps Script, so the Signatures tab records the browser type and the exact time only.
- **Local preview.** With Node.js installed, `node tests/local-server.js` runs the whole app on your computer with fake data, and `node tests/run-tests.js` runs the automatic tests.
