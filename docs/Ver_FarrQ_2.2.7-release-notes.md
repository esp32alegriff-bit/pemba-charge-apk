# Ver_FarrQ_2.2.7

Built on 2.2.6 (versionCode 40, installs over 2.2.5 or 2.2.6). App only. The Sheet script stays 2.2.5. Nothing is uploaded to the relay board, the CrowPanel or the display.
Works with a phone that is still on 2.2.5: nothing new is sent to the Sheet or asked from it.

## Battery % and time left in the block "EV meter, copied from the Sheet" (new)
- "Battery then (estimated)" and "Time left then (estimated)", worked out the same way as the dot matrix display:
  - pack 42.7 kWh and 10% loss (the display's own constants),
  - the whole % is cut off, not rounded (as on the display),
  - time left = energy still needed at the present charging power (same 10% loss).
- Start: the last battery % logged by either phone.
- Energy since then: the finished charges after that log, plus the running charge.
- Time left shows only while charging at 500 W or more (as on the display).
- No row when no energy has been delivered since the last log. The real logged % always shows beside it.
- Built only from data the phone already has. Nothing new goes to the Sheet.

## Limits
- It is an estimate "then", at the time the block was copied. It is not read from the display (the display is on the home network only).
- If a % was logged in the middle of a charge, the energy before the log may be counted again, so the estimate can run a little high. The display itself starts counting at the moment the % is sent to it.
- The display keeps a start % through short pauses (below 85%) and forgets it after 6 hours without charging. The app uses the last logged % only.

Tests: tests/remote/block_rows_test.js. Tested on a laptop with a fake Android bridge. Not yet tested on a phone.
