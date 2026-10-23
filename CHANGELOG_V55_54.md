# v55.54 — Arsalan frontend salary basis correction

- Corrected the shared frontend payroll calculator to use 30 salary days for Arsalan, matching the agreed PKR 45,000 monthly salary / PKR 1,500 daily rate.
- This shared calculator feeds Admin → Salary & Payroll calculations, payroll detail, and salary-release previews, so all those frontend views use the same 30-day denominator.
- Kept the distinct-date attendance deduplication and Babar Ali Khan's 10 October joining-date boundary from v55.53.
- Expected Arsalan calculation with 17 credited days and PKR 15,000 outstanding advances: PKR 25,500 gross and PKR 10,500 estimated net.
- No live Supabase data is modified by this frontend-only fix.
