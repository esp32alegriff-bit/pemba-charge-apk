# Ver_FarrQ_2.0

## New
- Forgot a charge log? A finished meter session now shows in History as a Home charge tagged AUTO.
- AUTO rows use the measured kWh; the battery % is an estimate (shown with ≈).
- AUTO rows are never saved into the log and never change trip maths; saving a real charge log replaces them.
- "View from anywhere": a copy of charges, trips, readings and meter sessions goes to your own Google Sheet.
- Works on Wi-Fi or mobile data, so it works abroad. Both phones merge into one Sheet.
- Sent a few seconds after any save, when the app opens, and after new meter sessions.
- Off until you enter the Google web address and password on Connections.
- Setup steps: docs/remote-viewing-google-sheet.gs (about 5 minutes, once).

## Unchanged
- Relay, START/STOP, 1.6 screens, Shelly and ESP32 meter support.

## Privacy
- Password and web address are kept out of backups and diagnostics.
- Deleting an entry in the app does not delete it from the Sheet.

## Tests
- tests/remote/sheet_script_test.js (Sheet script against a fake Sheet), tests/remote/ui_test.js (real page, fake Android bridge).
- Not tested against real Google yet; first real send is the proof.
