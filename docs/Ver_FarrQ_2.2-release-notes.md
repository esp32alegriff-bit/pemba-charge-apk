# Ver_FarrQ_2.2

Shelly charge graphs, battery % prompt, learning page and live estimate. Design, menus, relay and Google Sheet are unchanged.

- Battery % prompt: shown on Home during a Shelly session at the start, every 30 min or more, and when the charge power starts to drop. It can be skipped and never blocks charging. Each % is stored with its time (phone only, key farrq.sessPct).
- Graphs screen: Power (W), Current (A) and Cost (R, R50 steps, Home rate) against time. Pinch or drag to zoom and move; tap to read a point. Gold tags show battery % entered. Shows the current session or any past Shelly session.
- History: new card "Shelly charge sessions"; tap Graph to open one.
- Settings > Learning and estimates: sessions used, confidence (Rough 0-2, Improving 3-9, Good 10+), measured wall-to-battery ratio, learned taper near 100%, estimate from any battery %.
- Home: "Live charge estimate" below Settings while a Shelly session runs: time left, finish time, kWh to deliver (wall and battery), cost to 100%. Uses 42.7 kWh and the Settings loss % until 3 sessions have start and end %, then the measured ratio and the learned taper. Marked "based on kWh only" when no % was entered this session.
- Learned figures are rebuilt from all stored sessions every time (so after every update). Minute detail for past sessions is read from the Shelly (read only) and kept on the phone.
- New read-only Android call meterMinutes (Shelly EM1Data.GetData). Meter contract unchanged. Sheet script stays 2.1.2.
