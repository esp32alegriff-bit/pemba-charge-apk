# Ver_FarrQ_2.2.5

Built on 2.2.4 (versionCode 38, installs over 2.2.3 or 2.2.4). App and Sheet script only; nothing is uploaded to the relay board, the CrowPanel or the display.
Install the same version on both phones. Data on the phones stays; no import or export is needed.

## Live reading and alerts when away (new)
- The phone that can reach the Shelly (home) sends to the Google Sheet:
  - the live reading (watts, charging yes/no, day and month kWh): every 5 minutes while charging, every 30 minutes when idle, and at once when a charge starts or ends;
  - every alert it raises (waits in an outbox until the Sheet says OK, so nothing is lost if the Sheet is slow).
- A phone that cannot reach the Shelly (away, or the meter is down) asks the Sheet for the alerts every 5 minutes, also on mobile data, also with the app closed. It shows them in the alert log and as a notification. Each phone uses its own "Which alerts to show" ticks.
- The same alert is never shown twice (same type within 5 minutes; an alert that came from the Sheet is not sent back).
- "Meter offline" and "Meter back online" stay on the phone that saw them (an away phone cannot tell a dead meter from being away).
- While the app is open away from home, Home shows the card "EV meter, copied from the Sheet" with the time, charging yes/no, power and the day and month totals. It is up to about 5 minutes old while charging.
- Both phones at home: each sees the Shelly directly; nothing changes.

## Sheet script 2.2.5
- Must be pasted and redeployed (Deploy > Manage deployments > Edit > New version). The app says so when the script is older.
- New: alerts from the phone at home are stored in the Alerts tab; a pull request returns them; the EV METER block now updates every push and survives the Summary rebuild (it was wiped before).

## Limits
- Alerts are up to about 5 minutes late, more when Android is in deep sleep. Set the app to "Battery: unrestricted" on the phone that is away.
- Both phones away: no live data.
- Alerts abroad need the Sheet to be set up on both phones.

Tests: tests/remote/meter_copy_test.js, tests/remote/sheet_script_test.js, tests/store.
