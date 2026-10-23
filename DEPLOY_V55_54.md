# Deploy BCBM v55.54 — Arsalan frontend salary fix

1. Keep a backup of the current deployed build.
2. Deploy the ZIP contents to the same publishing root as the current app.
3. Hard-refresh the browser (Ctrl+F5) or clear the site's cached files so the updated `js/app.js` loads.
4. Sign in as Admin and open Salary & Payroll for October 2026; click View calculation for Arsalan.
5. Confirm attendance credited is 17.0, monthly base salary is PKR 45,000, attendance-adjusted base is PKR 25,500, outstanding advance is PKR 15,000, and estimated net after outstanding advances is PKR 10,500 (assuming the backend records match these amounts).

This fixes the frontend denominator. It does not modify any posted salary expense or Supabase records. If a salary payment is already posted, the app may show the posted amount; do not release or alter payroll until the displayed breakdown is verified.
