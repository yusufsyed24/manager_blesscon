# v55.53 deployment — frontend payroll fix

1. Keep the existing deployed version as a rollback copy.
2. Deploy the files from this ZIP to the same static hosting root. No SQL migration is required for these frontend changes.
3. Hard-refresh/reopen the app so the new JavaScript and service-worker cache are loaded.
4. In Admin → Salary & payroll, check Babar Ali Khan for October 2026: 14 credited days from 10–23 October, even if duplicate attendance rows exist on a date.
5. Check Arsalan's breakdown: 17 days, PKR 25,500 gross, PKR 15,000 outstanding advance, PKR 10,500 estimated net, assuming the backend records match those amounts.
6. Verify a manager and a salesman profile also show the net estimate after outstanding advances. Existing posted salary amounts remain displayed as posted payments.

This build was checked for JavaScript syntax and ZIP integrity. It has not been tested against your live Supabase project.
