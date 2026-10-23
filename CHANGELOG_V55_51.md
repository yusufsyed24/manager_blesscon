# v55.51 — Arsalan salary and Babar attendance correction

- Sets Arsalan's saved monthly base salary to PKR 45,000 and payroll working days to 30, producing PKR 1,500/day.
- With 17 credited days, base salary is PKR 25,500. If PKR 15,000 remains outstanding in posted salary advances, estimated net is PKR 10,500.
- Salary snapshots count at most one attendance credit per calendar date.
- Babar Ali Khan's manager salary snapshot only counts dates from his recorded joining date, 10 October 2026; this prevents pre-joining attendance and duplicate same-day rows from inflating the count.
- Profile salary breakdown explicitly labels the net-after-advances figure.

Validation: JavaScript syntax and ZIP integrity checks only; live Supabase data was not available for verification.
