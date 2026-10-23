# v55.52 — Actual salary and attendance logic correction

- Fixes the displayed estimated net salary: `total_paisa` now uses gross salary minus outstanding posted advances, while preserving an already-posted salary amount.
- Sets Arsalan's saved monthly base salary to PKR 45,000 and working-day divisor to 30 (PKR 1,500/day).
- Deduplicates attendance by calendar date for both salesman and manager salary snapshots, so multiple records for the same date do not inflate paid days.
- Handles an already-deduplicated v55.51 attendance function without replacing it again.
- Does not post or release salary, delete attendance, or alter existing posted expense records.

Expected Arsalan example: 17 days × PKR 1,500 = PKR 25,500 gross; less PKR 15,000 outstanding advance = PKR 10,500 estimated net, provided that advance balance is what the database records.
