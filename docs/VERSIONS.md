# Where we are: app version and Google Sheet script version

| App | Sheet script needed | What changed |
|---|---|---|
| Ver_FarrQ_1.9 / 1.9.1 | none | Shelly meter reader; notification fix |
| Ver_FarrQ_2.0 | 2.0 | AUTO charge rows; copy of log to Google Sheet |
| Ver_FarrQ_2.1 | 2.1 | Two-way sync of entries between phones |
| Ver_FarrQ_2.1.1 | 2.1.1 | Removes superseded AUTO rows from the Sheet; URL box colour |
| Ver_FarrQ_2.1.2 | 2.1.2 | App and Sheet script versions shown; Phones tab |
| Ver_FarrQ_2.1.3 | 2.1.2 (unchanged) | PDF report footer shows the real app version |
| Ver_FarrQ_2.1.4 | 2.1.2 (unchanged) | New PDF report (AUTO charges, meter sessions, Google Sheet status, times); Demo meter removed; 50AEMG3 wording |

Where to see it
- App: Connections > View from anywhere, under the buttons: "App ... · Sheet script ... (matches)".
- Sheet: Summary tab (VERSIONS) and Phones tab (each phone, its app version, last sync, script version).
| Ver_FarrQ_2.1.5 | 2.1.2 (unchanged) | Relay board address corrected to 192.168.1.120 in the app help text, defaults and docs |
| Ver_FarrQ_2.1.6 | 2.1.2 (unchanged) | AUTO charge no longer counted twice when a charge log is saved during the session; relay buttons: old status answers cannot overwrite a command, command is checked and retried once; report trend dates no longer overlap |
| Ver_FarrQ_2.1.7 | 2.1.2 (unchanged) | Relay board: waits 5 to 6 s and retries once before saying Not reachable; asks every 5 s instead of 3 s |
| Ver_FarrQ_2.2 | 2.1.2 (unchanged) | Shelly charge graphs (power, current, cost, pinch and drag zoom), battery % prompt during a Shelly session, History session picker, Learning and estimates page, live charge estimate on Home |
| Ver_FarrQ_2.2.1 | 2.1.2 (unchanged) | App name FARRUSCO-Q CHARGE; Share preview shows petrol cost and Rand saving vs a 8.5 L/100 km car |
| Ver_FarrQ_2.2.2 | 2.2.2 (new, optional; 2.1.2 still works) | Cost graph in R5 steps; no overlapping % tags; charge graphs and 8 new detail pages in the report; calculated battery % (separate); sustained power-drop prompt; exact background checks; clearer AUTO wording; new Sheet tabs |
| Ver_FarrQ_2.2.2.1 | 2.2.2 (unchanged) | Info and diagnostics: relay board details (4 LED dots, restart reason, signal, panels) and dot matrix display details, details page only; battery % entered during a charge is sent to the display; Charge log match window 24 h; report: alerts newest first with full text, all 8 new Sheet tabs listed |
| Ver_FarrQ_2.2.3 | 2.2.2 (unchanged) | Full charge detection (Shelly 0 W with both relays ON for 5 min), 5% check before learning, FULL/NOT FULL tags in the charge log, pasted backup also carries battery % readings and shared settings |
| Ver_FarrQ_2.2.4 | 2.2.2 (with meter copy, see docs) | Finished Shelly charges and the last meter totals copied from the Sheet to a phone away from home (tagged from_sheet, never double counted, removed when the real session arrives); no live data |
| Ver_FarrQ_2.2.5 | 2.2.5 (new, needed) | Both phones the same version. The phone at home sends the live reading every 5 minutes while charging (30 minutes otherwise) and every alert to the Sheet; a phone that is away asks the Sheet every 5 minutes (also on mobile data) and shows the alerts the owner ticked, with a notification; Home card shows power and charging state copied from the Sheet |
| Ver_FarrQ_2.2.6 | 2.2.5 (unchanged) | Block "EV meter, copied from the Sheet" also shows the last battery % with who logged it and when, car km, odometer and the last finished charge (kWh, minutes, cost). Reads existing data only; works with a phone still on 2.2.5 |
| Ver_FarrQ_2.2.7 | 2.2.5 (unchanged) | The block "EV meter, copied from the Sheet" also shows Battery then (estimated) and Time left then (estimated), worked out with the dot matrix display's own maths (42.7 kWh, 10% loss, whole % cut off, minutes at the present power) from the last logged % and the energy since. Reads existing data only; works with a phone still on 2.2.5 |
| Ver_FarrQ_2.2.8 | 2.2.5 (unchanged) | "Refresh latest data" button at the bottom of the block "EV meter, copied from the Sheet": the same sync as Send now in Connections, started from Home |
| Ver_FarrQ_2.2.8.1 | 2.2.5 (unchanged) | Block "EV meter, copied from the Sheet" shows Km since last charge. Graphs screen has a zoomable 1-week line graph of Car claim accuracy %, with a trend note. Reads this phone's own log only |
| Ver_FarrQ_2.2.8.2 | 2.2.5 (unchanged) | Block "EV meter, copied from the Sheet" shows Home charging this month (kWh and R), split into measured by meter and estimated from battery %. Station left out. Reads this phone's own log only |
