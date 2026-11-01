# FARR Q Charge — handover (read this first)

For ChatGPT, Codex, Claude or any person picking this project up. Written 21 Oct 2026 when Ver_FarrQ_1.7 was built.
Owner: GitHub `esp32alegriff-bit`. Hard rules for AI tools are in `AGENTS.md`.

## 1. What this is

**FARR Q Charge** is the owner's Android app for the family Chery Q electric car (42.7 kWh LFP, 6.6 kW onboard charger, charged at home on a 13 A Mode 2 cable at about 3 kW).

- **Ver_FarrQ_1.6 and earlier** — a web app (PWA) on GitHub Pages, repo `esp32alegriff-bit/farr-q-charge`. **Frozen. Never change that repo.**
- **Ver_FarrQ_1.7 and later** — this repo, `esp32alegriff-bit/farr-q-charge-apk`: the same app as a real Android APK, built free by GitHub Actions, plus the EV meter, relays, AUTO, alerts and diagnostics.

## 2. How the APK is built (important: the UI must not drift)

- `app/src/main/assets/web/index.html` is the **1.6 page with small additive edits only** (version label, a meter card on Home, five extra pages under Settings, measured kWh, backup rows). The look, layout, colours, maths and every 1.6 screen must stay exactly as they are.
- `app/src/main/assets/web/farrq-17.js` is the whole 1.7 layer: the new pages, the polling, sharing inside the APK, backup extras, the Android back button.
- The Java under `app/src/main/java/za/co/farrusco/farrqcharge/` is a thin shell with **no third-party libraries**:
  - `MainActivity` — WebView serving the page from `https://appassets.androidplatform.net/web/` (fixed origin, so localStorage persists), file picker, share-into-app, back button, permissions.
  - `Bridge` — `window.FarrNative` (`sync()` instant, `call()` async with a callback).
  - `Poller` + `PollReceiver` — the meter sync and the background checks.
  - `MeterApi` — `HttpMeter` (the ESP32-S3) and `DemoMeter` (the fake meter used for testing), same interface.
  - `Relay` — the existing relay board API.
  - `Alerts`, `Store`, `Net`, `ShareProvider`.
- Package `za.co.farrusco.farrqcharge`, minSdk 26, targetSdk 34, versionCode 17.

## 3. The system around it (do not change any of these)

| Part | Where | Status |
|---|---|---|
| Relay board (ESP32 dual relay) | `192.168.1.120`, LAN API with `X-Farrusco-Token`, ESP-NOW channel 6 | Working. Firmware **must not change**. Relay 1 = Eskom input to the inverter (GPIO17), Relay 2 = EV charger (GPIO16). No contactors fitted yet, so the relays click but do not switch power. |
| Waveshare 4.3" and CrowPanel 7" displays | ESP-NOW + MQTT from the Pi | Integrated, can also control the relays. **Do not change.** |
| Raspberry Pi 4 with ICM + FARRUSCO dashboard | `192.168.1.102`; brokers on 1883 (ICM, login `ICM`) and 1884 (FARRUSCO displays, read-only login) | Reverse-engineered and mapped with ChatGPT. **Do not change.** |
| Estelle Cherry Q Charging app (Codex) | repo `Estelle-Cherry-Q-Charging`, tags EF_1.1–EF_1.3 | Relay control app with time-based kWh estimates. **Read only. Do not change.** |
| FARR Q Charge 1.6 PWA | repo `farr-q-charge` | **Frozen.** |
| EV meter (ESP32-S3 Super Mini + Emporia 200 A clamp) | `192.168.1.128` | **Not built yet.** Firmware comes next; contract is fixed in `docs/meter-contract.md`. |

Home Wi-Fi: `Farrusco` (2.4 GHz, must stay on channel 6) and `Farrusco_5G` (5 GHz), same LAN. Passwords are **not** in any repo.

## 4. Decisions the owner made (21 Oct 2026)

**App**
- APK instead of the web app; UI and design exactly as 1.6; version **Ver_FarrQ_1.7**; public repo, free GitHub Actions build.
- History moves from 1.6 by the existing "Send backup as text" → "Paste backup" (or sharing the CSV into the app). 1.7 backups also carry measured sessions, alerts and the non-secret settings, in the same 8-column CSV so 1.6 simply skips the new rows.
- Bottom tabs stay Home, History, Graphs, Share. A live meter card on Home. New pages under Settings: Live meter and calibration, Relays and AUTO, Alerts, Connections, Info and diagnostics.
- When a Home (or Solar) charge is logged, the measured kWh of the meter sessions that ended since the previous reading replaces the battery-% × 42.7 × (1 + loss) estimate. Station charges are unchanged.
- The meter address (`http://192.168.1.128`), relay address (`http://192.168.1.120`) and relay token are typed into the app by the owner. Defaults for the addresses are pre-filled; the token is not.
- Calibration is in the app: live watts every second, a factor field, and a "Match" helper that takes the Ellies meter reading (the car draws about 3000 W at 13 A). The factor is saved **on the meter**, so every phone and display uses it.
- Info and diagnostics page: everything the app is set to, meter and relay status, logs, how-to guides (router reservation, calibration, 1.6→1.7 move, updates, troubleshooting), technical reference, and "Share diagnostics".
- **Demo meter**: removed in Ver_FarrQ_2.1.4 (the Shelly is installed). Any old demo data is cleared on first start.

**Alerts and background (hard rule: low CPU, RAM and battery)**
- All alert types shown and notified (each can be switched off).
- No foreground service and no permanent notification. Inexact alarms only: about every 30 s while charging, 5 min idle, 15 min if the meter cannot be reached; **nothing at all off Wi-Fi**. Android wakes the app when Wi-Fi connects (PendingIntent network callback) and on boot.
- Away from home nothing runs and there is no cloud. On return to home Wi-Fi the app pulls every session and event the meter stored (by sequence number). More than 5 missed events become one summary notification.
- First contact with a meter (or a new `store_id`) imports its history without notifying it.

**Meter (firmware still to be built — follow `docs/meter-contract.md`)**
- Session starts above **100 W for 10 s**; ends below **50 W for 60 s** (so the taper near 100% does not split a charge).
- The ESP32 keeps every session plus daily and monthly totals in flash and survives reboots and Wi-Fi loss (saves every 60 s and at session end).
- ESP-NOW broadcast to `FF:FF:FF:FF:FF:FF`, channel 6, open, **maximum TX power** (about 20 dBm).
- MQTT on: publishes only, to `192.168.1.102:1883` with the ICM login, under its own `farrusco/evmeter/...` topics so it can never clash with ICM. If 1883 turns out to accept only the Pi itself, the fallback (a publish login on 1884) needs the owner's approval first.
- Fixed IP `192.168.1.128` set in the firmware; router reservation optional (guide is in the app).
- Wi-Fi SSID/password live in a `secrets.h` that is **git-ignored**. The ESP32-S3 joins 2.4 GHz `Farrusco` only.
- The owner will cut the clamp's 3.5 mm plug and solder the two wires to the S3. Planned circuit: 100 Ω burden across the clamp, 2 × 10 kΩ bias divider from 3.3 V with 10 µF to GND, sleeve → midpoint, tip → ADC1 pin (GPIO4 planned). Pins are confirmed when the meter is built.
- **AUTO** (default MANUAL, runs on the meter so it works while everyone is away): only ever switches **Relay 2 (EV) OFF**, never anything ON, never Relay 1. Off when ≤ 100 W for 60 s after a real session started, or if Relay 2 is ON but the car never draws power within 10 min. Sends OFF once; if power keeps flowing → `relay_off_power_flowing` alert (expected until contactors are fitted). All thresholds editable in the app.
- Manual START/STOP CHARGING in the app uses the relay board's own sequence unchanged (START: Eskom ON then EV ON; STOP: EV OFF then Eskom OFF). The owner confirmed this.
- Charging must never be blocked by the relay board being off or faulty.

## 5. Signing and releases

- One permanent signing key for every version (so updates install over the top and keep data). It is stored **encrypted** at `signing/farrq-release.jks.enc` (AES-256, PBKDF2 200 000 rounds); the password is the GitHub secret `FARRQ_SIGNING_PASS`. Alias `farrq`; store and key password are the same secret. The owner also holds an offline copy of the key and password.
- Push to `main` → Actions builds the APK as an artifact (a TEST-ONLY debug APK if the secret is missing).
- Every signed push to `main` publishes (or refreshes) the GitHub Release named after `versionName`, with `FARR-Q-Charge-Ver_FarrQ_x.y.apk`. Bump the version before pushing a new release. Download page: https://github.com/esp32alegriff-bit/farr-q-charge-apk/releases/latest
- For every new version: bump `versionCode` and `versionName` in `app/build.gradle.kts`, the header text in `index.html`, `APP_VERSION` in `Store.java`, and add `docs/Ver_FarrQ_x.y-release-notes.md`.

## 6. What comes next

1. Owner installs Ver_FarrQ_1.7, moves 1.6 history across, tests with the Demo meter, and reports small tweaks.
2. Meter firmware (ESP32-S3 Super Mini, PlatformIO, in `~/ESP32-PROJECTS/CLAUDE_CODE_LINUX/<name>` on the owner's Debian laptop): pin-out and circuit confirmed on the bench, compile, **ask before flashing**.
3. Read-only check on the Pi that port 1883 accepts LAN connections (`hostname -I`, `ss -lnt | grep -E ':188[34]'`, mosquitto listener lines). Nothing on the Pi is changed.
4. Later, with the owner's approval only: Pi dashboard, Waveshare and CrowPanel can read the meter from MQTT or ESP-NOW using `docs/meter-contract.md`.
