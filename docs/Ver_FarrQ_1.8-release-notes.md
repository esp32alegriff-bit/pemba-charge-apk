# FARR Q Charge Ver_FarrQ_1.8

Same look as 1.6 and 1.7. Changes:

**Home**
- Order: period chips, efficiency card, Anytime log and Charge log, EV meter card, Relays and AUTO, Settings button, then the totals card at the bottom.
- Relay 1 and Relay 2 ON/OFF and MANUAL/AUTO are on Home as well as on the Relays page.
- Relay buttons show the state: ON is green when that relay is on, OFF is red when it is off, and both are grey when the relay board cannot be reached.
- The EV relay line on the meter card reads the relay board directly; it falls back to the meter's report, labelled as such, when the board is not reachable.

**Dialogs**
- Relay 1 OFF, START CHARGING, STOP CHARGING, AUTO, clearing alerts and turning Demo off now use an in-app dialog with a plain-English title and one sentence. The web address no longer shows.
- Each dialog has Cancel (the default) and a coloured confirm button.

**Demo**
- The demo relay switch ("let AUTO switch the real EV relay off") is set back to off every time Demo is turned off. It stays available until the contactors are fitted.

**History**
- Charge rows are labelled MEASURED (energy taken from the meter) or ESTIMATED (from battery %). Trip rows are ESTIMATED.

**Connections and Info**
- Connections says that Pi/MQTT is optional and shows whether MQTT is connected.
- Info and diagnostics starts with a communications panel: meter HTTP read, Wi-Fi signal, ESP-NOW sent and failed counts, MQTT state, relay board reachability.
- The last ESP-NOW packet age is not yet in the meter contract, so the panel shows "not reported by the meter yet" until the meter firmware adds it.

**Not in 1.8**
- Meter firmware, OTA updates, Google Drive upload and remote viewing come after the local meter works.

Move your history from 1.6 as before (Settings → Send backup as text → Paste backup). Importing again is safe.
