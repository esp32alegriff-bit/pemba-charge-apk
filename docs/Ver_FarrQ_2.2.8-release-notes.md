# Ver_FarrQ_2.2.8

Built on 2.2.7 (versionCode 41, installs over 2.2.5, 2.2.6 or 2.2.7). App only. The Sheet script stays 2.2.5. Nothing is uploaded to the relay board, the CrowPanel or the display.
Works with a phone that is still on 2.2.5: nothing new is sent to the Sheet or asked from it.

## "Refresh latest data" button (new)
- At the bottom of the block "EV meter, copied from the Sheet" on Home.
- One tap runs the same sync as "Save and send" / "Send now" in Connections: it sends this phone's data and asks the Sheet for the latest block, readings and alerts.
- The button shows "Refreshing…" while it works. A message says "Latest data received" or why it could not refresh.
- The block shows the new numbers at once (the battery % and time left estimates from 2.2.7 included).
- The button shows only where the block shows: when this phone cannot reach the meter (away from home).
- Without the Google Sheet set up it says so and does nothing.

Tests: tests/remote/block_rows_test.js (extended). Tested on a laptop with a fake Android bridge. Not yet tested on a phone.
