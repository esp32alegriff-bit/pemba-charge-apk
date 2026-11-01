# Ver_FarrQ_2.1.6

- Double count fixed: a typed charge saved while the meter session was still running now replaces the AUTO row.
- Relay: a late status answer could overwrite a switch-off, so the relay stayed shown ON. Answers are now ordered, relay requests run one at a time, and the app checks the relay changed and tries once more.
- Report: dates under the efficiency trend no longer overlap.
- Sheet script stays 2.1.2.
