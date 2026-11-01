# Ver_FarrQ_2.2.8.2

- EV meter block (Home): new row "Home charging this month (since <date>)".
- Shows kWh and Rands for Home charging in this calendar month.
- Station charges are left out.
- Two sub-rows: measured by meter, and estimated from battery %.
- Source: this phone's charge log (same log the Sheet "Charge log" copies).
- Rands = kWh x your Home rate setting. It is not the Eskom bill.
- Nothing new sent to the Sheet. Sheet script stays 2.2.5. Works with phones on 2.2.5.
- Tests: tests/remote/home_month_test.js (laptop browser only; not tested on a phone).
