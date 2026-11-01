# Ver_FarrQ_2.2.4

Built on the 2.2.3 code (versionCode 37, installs over 2.2.3). App only; nothing is uploaded to the relay board, the CrowPanel or the display.
Meant for the phone that goes abroad. The phone that stays at home can stay on 2.2.3.

## Finished charges from the Sheet (new)
- "Send now" (and the automatic send) now also asks the Google Sheet for the finished Shelly charges that the phone at home copied there (Meter sessions tab, newest 200) and the last EV METER block.
- Each charge the phone does not already hold is added as a copy tagged from_sheet: kWh, start, end, minutes, peak W, why it ended and cost. Home, History, Graphs, Share and the Learning page then use the real kWh and cost.
- A copy is only added when this phone has no measured session of its own at that time (start within 60 s, or overlapping). So at home nothing is counted twice.
- When the real session arrives from the Shelly (back on home Wi-Fi) the copy is removed automatically.
- Copies are never sent back to the Sheet, and the detail rows (Charge detail, Calculated %, Minute data) are never built from them, so they cannot overwrite the phone at home. They do count in the Daily totals "Shelly kWh", so those stay correct.
- Home shows an extra card "EV meter, copied from the Sheet" only while the meter cannot be reached. It carries the day and month totals as they were when the last charge ended, with the time. It is not a live reading.

## Sheet script
- Needs the script with the meter copy (docs/remote-viewing-google-sheet.gs, still 2.2.2, includes Cost R). Without it nothing changes and nothing breaks.
- The script only reads: it returns the sessions and the EV METER block. Old apps never ask for it.

## Not changed
- Relays, charging, firmware, Shelly polling, the Poller, alerts, learning maths, screens at home.
- The phone at home keeps working on 2.2.3.

New test: tests/remote/meter_copy_test.js.
