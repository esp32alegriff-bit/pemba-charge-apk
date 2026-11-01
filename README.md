# Pemba Charge 2 (bench build, odometer in the Charge log only)

Copy of FARR Q Charge Ver_FarrQ_2.2.8.2 with no trips and no Anytime log. Electricity cost first. The odometer is asked in the Charge log only and stored on charge entries only. Package `za.co.farrusco.pembacharge2`, version 2.0.0.1 (branch `pemba-v2`). Version 1.0.0.1 (no odometer at all, package `pembacharge1`) stays on `main`. The home app and the home Google Sheet are not touched.

---

# FARR Q Charge (Android APK)

Chery Q efficiency tracker with the FARRUSCO EV meter, relays, AUTO and alerts. **Ver_FarrQ_1.7.**

## Install or update

1. On the phone, open https://github.com/esp32alegriff-bit/farr-q-charge-apk/releases/latest
2. Tap the file **FARR-Q-Charge-Ver_FarrQ_x.y.apk** to download it.
3. Open it and tap **Install** (or **Update**). Allow "install from this source" if Android asks.
4. Updates install over the top and keep your data. Do not uninstall to update.

## First use

- Move your 1.6 history: in the old web app, Settings → **Send backup as text** → WhatsApp; copy the message; in 1.7, Settings → **Paste backup**.
- Settings → **Connections**: check the meter (`http://192.168.1.128`) and relay (`http://192.168.1.120`) addresses and type the relay token.
- Settings → **Alerts**: allow notifications and checks while the phone sleeps.
- The Demo meter was removed in Ver_FarrQ_2.1.4 now that the Shelly is installed.

## For developers and AI tools

Read `HANDOVER.md`, `AGENTS.md` and `docs/meter-contract.md`. Signing: `docs/release-signing.md`.
