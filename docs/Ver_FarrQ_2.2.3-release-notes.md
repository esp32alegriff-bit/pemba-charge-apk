# Ver_FarrQ_2.2.3

Built on the 2.2.2.1 code (versionCode 36, installs over 2.2.2.1 and over the Test build). App only; nothing is uploaded to the relay board or the display.

## Full charge detection (new)
- A charge counts as FULL when the Shelly reads 25 W or less and relay 1 and relay 2 are both still ON for 5 minutes. The plug cannot be removed while the relays are ON, so the car stopped by itself.
- NOT FULL: a relay was switched OFF while the car was drawing power, or the car drew power again after a pause.
- UNSURE: a relay was switched off during the 5 minutes, or the relay board could not be read. Logged as a full charge with a question mark, left out of learning.
- Runs in the background on every phone (about every 30 s for the few minutes after a charge ends, two read-only GET requests to the relay board per charge). Charging never depends on it.
- The verdict is stored on the session and shown as a tag on the charge row: FULL CHARGE, NOT FULL, FULL CHARGE? and NOT USED FOR LEARNING.
- Three new alert types in the alerts log (no notification): Full charge recorded, Charge ended before full, Charge ended not sure it was full.

## Learning
- A full charge with a start battery % counts as 100% at its end, but only if the kWh delivered fits within 5% of reaching 100% (pack size and loss from Settings). Otherwise it stays in the log and is not used for learning.
- A battery % you type after the charge always wins over the automatic 100%.
- Learning page: new counts for full charges, those used for learning, those kept only in the log, and relay-stopped charges.

## Pasted backup (WhatsApp)
- "Send backup as text" now also carries the battery % readings and the shared settings (pack size, loss, claim, petrol, compare, rates). Relay token, meter and MQTT details are not included.
- "Paste backup" merges: entries already on the phone are skipped, so pasting twice adds nothing. Settings from an older paste never overwrite newer ones.
- Full-charge verdicts travel with the meter sessions.
- Minute data for the taper is fetched from the Shelly by the other phone itself.

Sheet script stays 2.2.2. New tests: tests/shelly/FullLogicTest.java (20 checks), tests/v22/full_test.js.
