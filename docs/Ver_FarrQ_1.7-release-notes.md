# FARR Q Charge Ver_FarrQ_1.7

First Android APK. Same screens, colours and maths as 1.6, plus:

- **Live EV meter card** on Home: watts, amps, this session, today, mode, EV relay.
- **Live meter and calibration**: live reading every second, Ellies "Match" helper, calibration factor saved on the meter, session start/end levels, list of measured sessions.
- **Relays and AUTO**: Relay 1 (Eskom) and Relay 2 (EV) ON/OFF, START/STOP CHARGING (the relay board's own sequence), MANUAL/AUTO. AUTO runs on the meter and only ever switches the EV relay off.
- **Measured kWh**: Home and Solar charges use the energy measured by the meter instead of the battery-% estimate.
- **Alerts**: every meter, charging and relay alert, with notifications and light background checks on home Wi-Fi only.
- **Connections**: meter and relay addresses, relay token, MQTT to the Pi.
- **Info and diagnostics**: everything the app is set to, guides, technical reference, Share diagnostics.
- **Demo meter**: test everything before the meter is built.
- Backups now also carry measured sessions, alerts and settings (1.6 still reads its own part).
- Sharing a FARR Q backup from WhatsApp opens it straight in the app.

Move your 1.6 history: 1.6 Settings → Send backup as text → copy → 1.7 Settings → Paste backup.
