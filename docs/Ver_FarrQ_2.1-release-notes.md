# Ver_FarrQ_2.1

## New: the two phones stay in step
- Odometer, battery %, Anytime log and Charge log entries typed on one phone appear on the other.
- It happens by itself through your Google Sheet: after a save, when the app opens, when it comes to the front, and about every 90 s while it is open.
- AUTO charge rows need no sync: each phone builds them from the Shelly itself.
- Paste/import and backup still work as before.

## Safety rules
- Entries are matched by kind and time. Nothing is deleted or overwritten by sync.
- A blank "Home/Station/Solar" or car km is filled in when the other phone has it.
- Only the earliest starting point is kept, so the two phones share one timeline.
- After "Start fresh" on a phone, older entries from the Sheet are not brought back to that phone.
- If the Google script is the old one, the app still sends as before and simply receives nothing.

## Needed once: update the Google script
- Open the Sheet > Extensions > Apps Script, replace the code with docs/remote-viewing-google-sheet.gs, set the same password.
- Deploy > Manage deployments > pencil > Version: New version > Deploy. The web address stays the same.

## Tests
- tests/remote/sheet_script_test.js and tests/remote/ui_test.js (two-phone merge, junk ignored, no sync loops, Start fresh).
- Not tested against real Google and two real phones yet.
