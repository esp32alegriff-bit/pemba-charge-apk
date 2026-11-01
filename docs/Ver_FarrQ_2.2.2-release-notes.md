# Ver_FarrQ_2.2.2

- Cost graph axis in R5 steps; battery % tags no longer overlap.
- Report: charge line graphs (W, A, Rands with % marks), charge detail tables, battery % readings, calculated %, learning and estimates, loss, saving and payback, alerts log.
- Calculated battery % (separate function): when a Shelly charge has no Charge log, before % = next Anytime log % minus the % the charge added. Never changes efficiency, km or totals.
- Power-drop prompt waits for a sustained drop. Background checks use exact alarms when Android allows.
- Sheet script 2.2.2 (optional): adds tabs Charge detail, Battery % readings, Calculated %, Minute data, Estimates, Daily totals, Alerts, Settings log. Script 2.1.2 keeps working, no warnings.
