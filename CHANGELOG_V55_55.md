# v55.55 — Arsalan October 2026 payroll credited-day correction

- Admin payroll calculation now applies the business-owner-confirmed 17 credited days for Arsalan in October 2026 when the loaded qualifying attendance rows total fewer than 17.
- The adjustment makes the agreed PKR 45,000 monthly base use 17/30 = PKR 25,500 gross base salary (PKR 1,500 per credited day), before the PKR 15,000 advance deduction (estimated net PKR 10,500, assuming no other salary components/adjustments).
- The salary detail explicitly labels the one-day payroll adjustment. It does not create or modify an attendance row in Supabase; the underlying missing attendance date still needs separate reconciliation.
- Validation performed: `node --check js/app.js` and ZIP integrity check. No live Supabase/UI test performed.
