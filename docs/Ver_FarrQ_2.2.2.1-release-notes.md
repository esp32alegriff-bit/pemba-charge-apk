# Ver_FarrQ_2.2.2.1

- Info and diagnostics (Settings): new "Relay board, details" section with 4 LED dots (Eskom green/red, EV green/red), whether the LEDs match the relays, restart reason, uptime, Wi-Fi signal, memory, panel links and Home Monitor sends. LED and restart details appear once the relay board has firmware 2.2.
- Info and diagnostics: new "Display (dot matrix)" section: firmware, state, restart reason, Wi-Fi signal, Shelly and relay feeds, battery estimate. Shows "Display not reachable" when it does not answer. Refreshes every 8 s while open. Read-only.
- Battery % entered during a charge is also sent to the display (http://192.168.1.117/api/start). Best effort; failure never affects the app.
- The Home page is unchanged. The app never calls the display's update, orient or say addresses.
- A Charge log now counts for a Shelly charge up to 24 h after it ended (was 6 h).
- Report: alerts log newest first with the full text; "Battery % readings kept for learning"; the Sheet page lists all 8 new tabs.
- Sheet script stays 2.2.2. Nothing is uploaded to the relay board or the display.
