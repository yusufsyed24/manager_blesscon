# v55.53 — Frontend payroll and attendance consistency fix

- Admin payroll now credits attendance once per calendar date for every salesman and manager, matching the backend snapshot rules. Duplicate records/check-ins on a date cannot inflate credited days.
- Paid attendance status priority is applied per date: present/late/week_off = 1 day, half_day = 0.5, absent/leave/pending = 0.
- Babar Ali Khan's October 2026 frontend payroll count starts on 10 October, consistent with the backend manager salary snapshot.
- Employee salary cards and the salesman salary breakdown prefer the backend's net-after-advances estimate when available.
- No attendance, salary payment, advance, or other business records are changed by this frontend build.

Expected checks: Babar Ali Khan = 14 credited dates from 10–23 October 2026; Arsalan = 17 days × PKR 1,500 = PKR 25,500 gross, less PKR 15,000 outstanding advances = PKR 10,500 estimated net, assuming those values are confirmed in the backend.
