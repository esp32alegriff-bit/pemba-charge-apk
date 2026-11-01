# Ver_FarrQ_2.2.8.1

- EV meter block (Home): new row "Km since last charge".
- Km = latest odometer minus odometer at the latest Charge entry.
- Graphs screen: new card "Car claim accuracy over time (%)".
- Line graph, default window 1 week.
- Pinch, drag or scroll to zoom and move. Tap a dot to read it.
- "Reset to 1 week" button.
- Trend line text: Rising, Falling or Steady.
- Dashed line = overall accuracy (same as History).
- Per-entry accuracy = 100 − |gap|, same maths as "Accuracy of car claim".
- Nothing new sent to the Sheet. Sheet script stays 2.2.5. Works with phones on 2.2.5.
- Tests: tests/remote/acc_graph_test.js (11 checks, laptop browser only; not tested on a phone).
