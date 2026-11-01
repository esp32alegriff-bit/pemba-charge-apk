# FARR Q Charge Ver_FarrQ_1.9

Same look as 1.6 to 1.8. Change: the app can read a **Shelly EM Gen3** energy meter over home Wi-Fi.

**Meter**
- Type "Shelly EM Gen3" is detected automatically from the Meter address in Settings. No new setting.
- The ESP32 meter (contract v1) still works exactly as before.
- Live watts, amps, volts and the energy total come from one small request per check.
- Charge sessions are rebuilt from the minute records the Shelly stores itself (up to 10 days), so a charge is not lost when the phone is away or the app is closed.
- A session starts when a minute averages above 100 W and ends after one minute below 50 W. Both limits stay in the meter settings.
- Session kWh and cost are measured. Today and month totals are added from stored sessions.
- A power cut or a gap in the meter's records closes a running session (reason `meter_gap`).
- Alerts: charging started, charging finished, clamp type not set, clamp on backwards.
- The Calibration factor in the app multiplies the Shelly readings, as it does for the ESP32 meter.

**Safe by design**
- The app only reads the Shelly. It never calls DeleteAllData or ResetCounters.
- If the Shelly has a password set, the app says so. Turn authentication off on the Shelly for now (digest login is not built).

**Not in 1.9**
- AUTO with the Shelly (nothing runs on that meter). Choosing AUTO shows a clear message. START/STOP and the relay buttons are unchanged and work as before.
- MQTT from the Shelly to the displays and the Farrusco dashboard.

**First use with the real Shelly**
- Join the Shelly to the home Wi-Fi, give it a fixed address in the router, put that address in Settings, Meter address.
- Set the clamp type once on the Shelly: `http://<meter address>/rpc/EM1.SetConfig?id=0&config={"ct_type":"50AEMG3"}` (this meter accepts only `50AEMG3` or `80A`; plain `50A` is rejected).
- If watts read negative, the clamp is on backwards (K to L), or set reverse: `http://<meter address>/rpc/EM1.SetConfig?id=0&config={"reverse":true}`.
- Compare with the Ellies meter on a kettle, then the charger, and set the Calibration factor in the app.

**Added meter fields (contract grows, nothing renamed)**
- `volts`, `pf`, `freq`, `meter_type`, `meter_errors` in the live reading when the meter is a Shelly.
