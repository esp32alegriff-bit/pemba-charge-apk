# FARRUSCO EV meter — data contract v1

The EV meter is an ESP32-S3 with an Emporia 200 A clamp on the live conductor of the Chery Q charging circuit.
This file is the single source of truth for every device that talks to it: the FARR Q Charge app (Ver_FarrQ_1.7 and later),
the meter firmware, the Raspberry Pi FARRUSCO dashboard, the Waveshare 4.3" and the CrowPanel 7".

Rules for anyone changing this contract:

- Only **add** fields. Never rename, remove or change the meaning or unit of an existing field.
- Bump `contract` (below) only for a breaking change, and only with the owner's approval.
- No secrets in this file. Passwords and tokens are entered in the app and stored on the phone and the meter.

## 1. Device

| Item | Value |
|---|---|
| Hostname | `farrusco-ev-meter` (`farrusco-ev-meter.local`) |
| Fixed IP | `192.168.1.128` (set in the meter firmware; router reservation optional) |
| Wi-Fi | 2.4 GHz `Farrusco` only (ESP32-S3 has no 5 GHz radio); router channel must stay **6** |
| TX power | maximum (about 20 dBm) |
| Firmware name | `FQM_x.y` (reported as `fw`) |
| Contract | `1` (reported as `contract`) |

The meter must keep working with no Wi-Fi, no Pi, no phone and no relay board: it measures, detects sessions and stores them in flash regardless.

## 2. Measurement and session rules (run on the meter)

- Real power estimate: `watts = raw_irms × cal_factor × 230`. `amps = watts / 230`. The fixed 230 V and power factor are absorbed by calibration against the Ellies meter.
- `raw_irms` is the RMS clamp reading in nominal amps before calibration; `cal_factor` defaults to `1.000`.
- **Session start:** `watts > start_w` (default 100) continuously for `start_s` (default 10) seconds.
- **Session end:** `watts < end_w` (default 50) continuously for `end_s` (default 60) seconds.
- Energy is integrated from every sample, so a session's `kwh` is measured, not estimated.
- Totals (`today_kwh`, `month_kwh`, `total_kwh`) include the running session.
- **Persistence:** the running session and totals are saved to flash every 60 s and at session end. A power cut loses at most about one minute. After a reboot an interrupted session is closed with `end_reason: "power_loss"`.
- **Time:** NTP (`pool.ntp.org`, SAST UTC+2). Until the clock is set, `time_valid` is `false`; the meter back-dates stored times once NTP arrives (it keeps uptime stamps for this).
- Session and event numbers (`seq`) start at 1, only ever increase, and survive reboots. `store_id` is a random 8-hex id created when the flash store is first formatted; if it changes, clients must treat the meter's numbering as new.

## 3. AUTO (run on the meter)

- `mode` is `"MANUAL"` (default) or `"AUTO"`. Stored on the meter so every phone and display shows the same mode.
- AUTO **only ever sends `POST /api/v1/relay/2/off`** to the relay board. It never switches anything ON and never touches Relay 1 (Eskom).
- **Arm:** AUTO watches from the moment it sees Relay 2 switch ON (from any controller: app, Waveshare, CrowPanel) or a session start.
- **Auto-off:** once a session has started, `watts <= auto_off_w` (default 100) continuously for `auto_off_s` (default 60) s → Relay 2 OFF, event `auto_off`.
- **No-start:** Relay 2 ON but no session starts within `auto_nostart_min` (default 10) min → Relay 2 OFF, event `auto_nostart_off`.
- After sending OFF it sends it **once only**. If power still flows 30 s later → event `relay_off_power_flowing` (normal while no contactor is fitted; later it means a stuck contactor). No repeat commands.
- If the relay board does not answer → event `relay_cmd_failed`. Charging is never blocked by a missing or faulty relay board.
- The meter reads relay state with `GET /api/v1/status` every 5 s (only to arm AUTO and report it).

## 4. HTTP API (home network, plain JSON, no token)

All responses are `Content-Type: application/json`. Times are epoch milliseconds (`*_ms`) or seconds (`*_s`). Energy in kWh, power in W, current in A.

### GET /api/v1/meter — live snapshot

```json
{
  "contract": 1, "fw": "FQM_1.0", "device": "farrusco-ev-meter", "store_id": "a1b2c3d4",
  "boot": 12, "uptime_s": 86400, "time_valid": true, "now_ms": 1761055200000,
  "watts": 3012.4, "amps": 13.10, "raw": 13.0412, "cal_factor": 1.004, "volts_nominal": 230,
  "charging": true,
  "session": { "seq": 41, "start_ms": 1761050000000, "duration_s": 5200, "kwh": 4.251, "peak_w": 3061, "avg_w": 2943 },
  "today_kwh": 4.251, "month_kwh": 61.882, "total_kwh": 61.882,
  "mode": "AUTO",
  "auto": { "state": "watching", "below_s": 0 },
  "relay": { "reachable": true, "relay1_on": true, "relay2_on": true, "last_cmd": "", "last_result": "", "last_ms": 0 },
  "last_session_seq": 40, "last_event_seq": 233,
  "wifi": { "ssid": "Farrusco", "rssi": -61, "channel": 6, "ip": "192.168.1.128", "mac": "AA:BB:CC:DD:EE:FF" },
  "mqtt": { "enabled": false, "connected": false, "last_error": "" },
  "espnow": { "tx_dbm": 20, "sent": 1234, "fail": 0 }
}
```

- `session` is `null` when not charging.
- `auto.state` is one of `off` (MANUAL), `idle` (nothing to watch), `armed` (relay on, waiting for the car), `watching` (session running), `below` (counting down to auto-off), `sent` (OFF sent).

### GET /api/v1/sessions?after=N&limit=50 — finished sessions after number N

```json
{ "store_id": "a1b2c3d4", "more": false, "sessions": [
  { "seq": 41, "start_ms": 1761050000000, "end_ms": 1761071000000, "duration_s": 21000,
    "kwh": 17.42, "peak_w": 3061, "avg_w": 2986, "tariff": 3.88, "cost": 67.59,
    "end_reason": "below_threshold", "time_valid": true }
]}
```

`end_reason`: `below_threshold`, `auto_off`, `auto_nostart_off`, `power_loss`. The meter keeps at least the last 2000 sessions.

### GET /api/v1/events?after=N&limit=50 — events after number N

```json
{ "store_id": "a1b2c3d4", "more": false, "events": [
  { "seq": 234, "ts_ms": 1761071000000, "type": "session_end", "level": "info",
    "text": "Charging finished: 17.42 kWh in 5 h 50 min", "data": { "session_seq": 41 } }
]}
```

| type | level | when |
|---|---|---|
| `session_start` | info | a session starts |
| `session_end` | info | a session ends |
| `charge_stopped_abrupt` | warning | power fell from above 1000 W to below `end_w` within 60 s |
| `auto_off` | info | AUTO switched Relay 2 OFF after charging finished |
| `auto_nostart_off` | warning | AUTO switched Relay 2 OFF because the car never drew power |
| `relay_off_power_flowing` | warning | Relay 2 reported OFF but power still flows 30 s later |
| `overcurrent` | critical | `amps > overcurrent_a` (default 14) for 10 s |
| `relay_cmd_failed` | warning | the relay board did not accept a command |
| `meter_boot` | info | the meter restarted (`data.reason` = reset reason) |
| `time_synced` | info | NTP time obtained |
| `config_changed` | info | a setting changed (`data.keys`) |
| `mqtt_error` | warning | MQTT connect or publish failed (at most once per hour) |

The app adds two local types: `meter_offline` (3 failed checks in a row on Wi-Fi) and `meter_online`.

### GET /api/v1/config and POST /api/v1/config

POST takes any subset of these keys and returns the full config. Unknown keys are ignored. Secrets are write-only: GET returns `relay_token_set` and `mqtt_pass_set` booleans instead of the values.

```json
{
  "cal_factor": 1.000,
  "start_w": 100, "start_s": 10, "end_w": 50, "end_s": 60,
  "mode": "MANUAL", "auto_off_w": 100, "auto_off_s": 60, "auto_nostart_min": 10, "overcurrent_a": 14.0,
  "tariff": 3.88,
  "relay_url": "http://192.168.1.120", "relay_token": "(write only)",
  "mqtt_enabled": false, "mqtt_host": "192.168.1.102", "mqtt_port": 1883, "mqtt_user": "ICM", "mqtt_pass": "(write only)"
}
```

Validation on the meter: `0.05 < cal_factor < 20`, `end_w <= start_w`, all numbers ≥ 0, `mode` in `MANUAL|AUTO`. Invalid → HTTP 400 `{"error":"..."}`.

### GET /api/v1/diag

Free-form object for the diagnostics page, for example `heap_free`, `heap_min`, `psram`, `flash_used`, `flash_total`, `reset_reason`, `sessions_stored`, `events_stored`, `adc_pin`, `adc_offset`, `sample_rate`, `noise_floor_w`, `ntp_server`, `build_time`.

### POST /api/v1/mqtt/test

Tries the broker with the stored settings and returns `{ "ok": true, "message": "Connected to 192.168.1.102:1883" }`.

## 5. ESP-NOW broadcast

- Destination `FF:FF:FF:FF:FF:FF`, channel 6, unencrypted, every 2 s and immediately on any session, mode or relay change.
- Little-endian, packed, 40 bytes:

| Offset | Type | Field |
|---|---|---|
| 0 | char[4] | magic `"FQEV"` |
| 4 | uint8 | version = 1 |
| 5 | uint8 | msg_type: 1 = live, 2 = session_end, 3 = event |
| 6 | uint16 | packet counter |
| 8 | uint32 | epoch seconds (0 if `time_valid` is false) |
| 12 | float | watts |
| 16 | float | amps |
| 20 | float | running session kWh (0 when idle; for msg_type 2 the finished session kWh) |
| 24 | float | today kWh |
| 28 | uint32 | session seq (running or just finished) |
| 32 | uint16 | event type code (msg_type 3; 0 otherwise) in the order of the table in section 4, starting at 1 |
| 34 | uint8 | flags: bit0 charging, bit1 AUTO, bit2 relay reachable, bit3 relay1 on, bit4 relay2 on, bit5 time valid, bit6 MQTT connected |
| 35 | uint8 | Wi-Fi RSSI + 128 (0 = unknown) |
| 36 | uint32 | uptime seconds |

Receivers must check magic and version and ignore anything else. Nothing is ever received or obeyed by the meter over ESP-NOW.

## 6. MQTT (meter publishes only; never subscribes to commands)

Broker: the Pi at `192.168.1.102:1883`, login `ICM` (password entered in the app). Off until switched on and tested in the app.
Fallback, only with the owner's approval: a publish login on the FARRUSCO broker `192.168.1.102:1884`.

| Topic | Retained | When | Payload |
|---|---|---|---|
| `farrusco/evmeter/status` | yes | connect, and LWT | `online` / `offline` |
| `farrusco/evmeter/live` | no | every 5 s | the `/api/v1/meter` JSON |
| `farrusco/evmeter/session` | yes | each finished session | one session object |
| `farrusco/evmeter/event` | no | each event | one event object |
| `farrusco/evmeter/totals` | yes | every 60 s and at session end | `{"today_kwh","month_kwh","total_kwh","tariff","today_cost","month_cost"}` |
| `farrusco/evmeter/config` | yes | on change | the `/api/v1/config` JSON (no secrets) |
| `farrusco/evmeter/diag` | no | every 60 s | the `/api/v1/diag` JSON |

The meter uses its own topic tree only, so it can never clash with the ICM topics the Pi already sends to the Waveshare and CrowPanel.

## 7. Relay board commands the meter and app use (relay firmware unchanged)

From `Estelle-Cherry-Q-Charging/docs/relay-api-contract.md`: `GET /api/v1/status`, `POST /api/v1/relay/{1|2}/{on|off}`, `POST /api/v1/charge/start`, `POST /api/v1/charge/stop`, header `X-Farrusco-Token`. Relay board at `192.168.1.120`.
