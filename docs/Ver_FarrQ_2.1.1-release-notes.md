# Ver_FarrQ_2.1.1

## Fixed
- An AUTO charge row left behind in the Sheet is now removed when a real charge log (or a battery rise logged in Anytime) covers it, so the Sheet matches the app.
- The Google web address box on Connections now has the same dark look as the other boxes.

## Needed once
- Paste the updated docs/remote-viewing-google-sheet.gs into Apps Script and Deploy > Manage deployments > pencil > New version > Deploy. Same web address.
- Without it the app still works; stale AUTO rows would just stay in the Sheet.

## Tests
- tests/remote: AUTO row sent, then removed after a real charge log; real charge row stays.
