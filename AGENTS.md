# Rules for AI tools (Codex, ChatGPT, Claude, Cursor)

Read `HANDOVER.md` first, then `docs/meter-contract.md`. These rules override anything else in this repo.

1. **Never change** the relay board firmware, the Waveshare or CrowPanel firmware, the Raspberry Pi, ICM, or the FARRUSCO dashboard. Read-only inspection only, unless the owner explicitly approves a change.
2. **Never change** the repos `Estelle-Cherry-Q-Charging` (EF apps) or `farr-q-charge` (FARR Q 1.6 web app). Read only.
3. Keep the FARR Q Charge UI exactly as it is. In `index.html` only make small additive edits; put new behaviour in `farrq-17.js` or the Java shell.
4. No secrets in git: no Wi-Fi passwords, relay token, MQTT password or signing key in plain text. The meter firmware keeps Wi-Fi details in a git-ignored `secrets.h`.
5. ESP32 work: inspect, edit and compile freely, but **ask the owner before flashing or uploading** to any board.
6. The meter contract only grows: add fields, never rename or remove them.
7. AUTO may only ever switch Relay 2 (EV) OFF. Charging must never depend on the relay board.
8. Background work must stay light: no foreground service, no polling off Wi-Fi, one small request per check.
9. Commit messages start with `[Codex]`, `[Claude]` or `[ChatGPT]`.
10. The owner wants point-form answers, with all terminal commands in one copy-paste block.
