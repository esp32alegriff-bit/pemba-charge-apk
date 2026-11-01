# Ver_FarrQ_2.2.6

Built on 2.2.5 (versionCode 39, installs over 2.2.5). App only. The Sheet script stays 2.2.5. Nothing is uploaded to the relay board, the CrowPanel or the display.
Works with a phone that is still on 2.2.5: this version sends nothing new to the Sheet and asks nothing new from it.

## More rows in the block "EV meter, copied from the Sheet" (new)
- Last battery % logged, with the name of the phone that first logged it (the Sheet keeps the first sender).
- When it was logged.
- What the car said (km), and the odometer, at that reading.
- Last finished charge: when it ended, kWh, minutes and cost.
- Everything comes from data the phone already has: the log entries and the finished charges copied from the Sheet.
- The rows refresh with the block: about every 85 to 115 seconds while the app is open on screen. With the app closed the block does not refresh (background checks bring alerts only).
- The name is stored on the phone next to each log entry. It is never sent to the Sheet.

## Not included
- Relay ON/OFF and relay signal. 2.2.5 never sends them, so an away phone cannot show them.
- "Charge so far" for a charge that is still running (derived, not exact).

Tests: tests/remote/block_rows_test.js (new), plus all existing suites (remote, v22, report, store). Tested on a laptop with a fake Android bridge. Not yet tested on a phone.
