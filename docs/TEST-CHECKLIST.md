# Test checklist

Run this once after installing, with the sample data (`loadSampleData`). Use three browser windows if you can: an Admin account, a Station Helper account, and a private window that is not signed in (the parent).

The same journey runs automatically, without Google, with `node tests/run-tests.js` (46 checks). This list is for checking the real deployment.

## A. Setup
- [ ] The Sheet has the tabs Config, Staff, Students, Signatures, Devices, Checkouts, Repairs, ActivityLog, MailQueue.
- [ ] The staff link opens Home for the Admin. Step 1 says "10 students and 10 Chromebooks are in the system."
- [ ] The staff link in the private window does not show the app.
- [ ] Settings, Technical: `PARENT_APP_URL`, `STAFF_APP_URL`, `DRIVE_FOLDER_ID` and the three `..._TEMPLATE_FILE_ID` settings are filled in.
- [ ] Settings, Technical, **Test the PDF forms** showed three `OK` lines (install guide, Step 4b).

## B. Import
- [ ] Home, **Import a list**, **Download the blank template** downloads a file.
- [ ] Choose `samples/students.csv` and press **Check the list**: 0 new, because they already exist.
- [ ] Change one parent email in the file and check again: 1 change, showing the old and new email.
- [ ] Add a row with grade `4` and a row with no student ID: both are marked Problem.
- [ ] Save without ticking the change: the email is unchanged. Tick it and save: it changed, and the student's History shows the old and new value.
- [ ] No email was sent by the import.
- [ ] Home, **Add one student** works. Saving the same ID twice is refused.

## C. Sending links
- [ ] Open *Ava Martinez*, More actions, **Edit student and parent details**, and set Parent 1 email to your own address.
- [ ] On Ava's page press **Send the link**. The preview shows 1 email, in Spanish. Send it.
- [ ] The email arrives with a button. Ava now reads "Link sent, has not signed".
- [ ] Home step 2 counts 1 student with no email (*Mia Johnson*). **Print 1 QR letter** opens the print dialog with a QR code.
- [ ] On a student page, More actions, **Copy the link** copies a link ending in `?code=`.

## D. Parent signs all three forms (private window, ideally on a phone)
- [ ] Open Ava's link. It starts in Spanish at "Paso 1 de 7". **English** switches every text except the Digital Promise and Verizon documents, which stay in English.
- [ ] Step 1 shows the student name and grade, the price table, the cost sharing table and the agreement text. **Continue** without ticking the box shows a message.
- [ ] Step 2: empty boxes show a message. There is no mailing address box.
- [ ] Step 3 shows the 2026-2027 Digital Promise agreement with the student's name as End User in the first paragraph.
- [ ] Step 4 shows "Participant Name" with the student's name and nine lines (including international calls). Without initials, or with one box unticked, **Continue** shows a message. Ticking a box shows the initials next to it.
- [ ] Step 5: the Verizon General Release. **Continue** without choosing Agree and Consent or DO NOT Consent shows a message. Try DO NOT Consent on one test student: the student page then shows a warning that Verizon may not photograph them.
- [ ] Step 6: sign. Step 7: the student signs. Press **Back**: the parent signature is still there.
- [ ] **Sign and submit** shows **Thank you** and says all three forms were saved.
- [ ] The Thank you screen lists the three forms, each with a **Download** button. Download all three on the phone and open them: they are your own forms, filled in.
- [ ] The receipt email arrives with the same three PDFs attached.
- [ ] Open the same link again: it says the agreement is already signed, with the date, and offers **Download your signed forms**. More than an hour after signing, that button is gone.
- [ ] Staff app: Ava reads "Ready for a Chromebook". Her History shows Link opened, Parent signed, Student signed, both partner forms "Signed online", and three lines "PDF created".

## E. The three PDFs
- [ ] Drive: `Chromebook Agreements 2026-2027 / Grade 5 / Martinez_Ava_900001 /` holds `Martinez_Ava_Gr5_ChromebookAgreement.pdf`, `Martinez_Ava_Gr5_DigitalPromise.pdf`, `Martinez_Ava_Gr5_VerizonRelease.pdf` and a `_signatures` folder.
- [ ] Chromebook Checkout (2 pages): it is the 2026-2027 form with its own price table. On page 2 check the student name, parent name, grade, date, both signatures, and the small "Signed electronically" line at the bottom.
- [ ] Digital Promise (3 pages): student name as End User in the first paragraph; page 3 with the student name as Participant Name, "parent / student" initials (for example RC / LC) on all nine lines, and both signatures and dates.
- [ ] Verizon (2 pages): on page 2 the parent and student printed names, the date, an X in the box the parent chose, and both signatures.
- [ ] On Ava's page, More actions opens each of the three PDFs. The History shows "PDF viewed" each time.

## F. Deployment screen: forms (Station Helper window)
- [ ] The helper sees only the Deployment day screen, with no menu.
- [ ] Search "Ava". No phone number, email, address or PDF is shown anywhere.
- [ ] Search "Liam" (not signed): **Sign now on this tablet**, then **Open the signing form**, opens the form in a new tab.
- [ ] Search "Ava" again after she signed online: **READY**, with no paper form needed. Press **Forms are complete. Continue**.
- [ ] Paper path: for a student whose Digital Promise form is marked missing, an Admin opens the student and sets it to *Paper copy received and checked*. The helper's **Check again** then shows **READY**.

## G. Deployment screen: assign
- [ ] Type a tag that does not exist (`XYZ`): refused.
- [ ] Without ticking "I explained the Chromebook Policy and the repair costs": the app asks you to tick it.
- [ ] Scan or type `TEST-1001` and confirm: assigned.
- [ ] Try to give `TEST-1001` to another ready student: **STOP**, already assigned.
- [ ] A student who is not ready never shows the asset tag box.
- [ ] Drive, in Ava's folder: a new file `Martinez_Ava_Gr5_CheckoutRecord_TEST-1001.pdf` lists the student, asset tag, serial number, who checked it out and the time. The three signed PDFs are unchanged.
- [ ] On Ava's page, More actions, **Open the check-out record** downloads it.

## H. Deployment screen: check it works
- [ ] The screen says "Ask the student to sign in". Press **The student signed in and it works**: the banner changes to **FINISHED**.
- [ ] On another assigned student, **There is a problem** sends an email to the IT address.

## I. Asset Tiger and inventory
- [ ] Home step 5, **Export for Asset Tiger** downloads a file. Ava's row says *Elementary Student*.
- [ ] Press **They are in Asset Tiger now**. Home no longer counts those check-outs.
- [ ] Chromebooks and repairs: both inventory reports download, and the totals match the list.
- [ ] Chromebooks and repairs, **Check-outs** lists Ava with `TEST-1001`, the time and your name. **Save as a Google Sheet** creates a dated Sheet in the Drive folder and opens it.

## J. Repair, loaner, lost
- [ ] Chromebooks and repairs, Repairs and lost reports, **New repair** for Ava. She reads "Chromebook is in for repair". IT gets an email.
- [ ] Click the repair, choose part *Keyboard*, status *In repair*, save. School pays $59.00, student pays $0.00. The Chromebook status is In repair.
- [ ] Set status *Closed*: the Chromebook is Assigned again and Ava reads "Has Chromebook TEST-1001".
- [ ] A second repair with cost 59.00: $29.50 each.
- [ ] Loaners: give out `TEST-1010`. It is listed with today's due time. Press **It is back**.
- [ ] Open the staff link followed by `?page=repair` with a school account and send a request. It appears in the repair list.
- [ ] **Lost or stolen Chromebook** for a test student: the Chromebook is Lost, and Reports shows the claims rate.

## K. Return
- [ ] Ava's page, More actions, **Chromebook not returned**: she appears under Reports, "Chromebooks not returned, records on hold".
- [ ] **Chromebook returned**: the Chromebook is In stock, Ava reads "Chromebook returned", and she is off the report.

## L. Access and settings
- [ ] Settings, People, **Switch all helpers off**: the helper's next tap says access denied.
- [ ] An IT Staff account has no Settings and no import or send buttons, and sees no parent contact on a student page.
- [ ] Settings, Prices: change the Keyboard price and save. A new parent link shows the new price.
- [ ] Reports: the list of students who are not ready prints and downloads.

## Clean up
- [ ] Delete the sample rows (keep the heading row) in Students, Devices, Signatures, Checkouts, Repairs and ActivityLog, and the test files in Drive.
