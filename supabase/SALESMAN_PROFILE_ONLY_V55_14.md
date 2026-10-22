# v55.14 — Salesman profile-only access

## Changes
- Salesman navigation is restricted to **My profile**. Management, finance, sales-order, invoice, quotation, ledger, stock, pricing, target-management, settings, and administration modules are not shown.
- A salesman login always opens its own profile, even if the browser remembers a previously selected module from another login on the same device.
- The profile shows the manager-uploaded profile photo and private documents, date of birth, assigned area, stock assigned/returned/sold by selected day, current stock in hand, monthly sales boxes, target achievement, and salary estimate.
- Salary estimate achievement is based on confirmed sales-order line quantities (boxes divided by each line's boxes-per-carton), against the salesman monthly carton target. Posted salary records remain authoritative.
- Salesman profile details and uploaded documents remain read-only to the salesman.

## Deploy
1. Back up the Supabase database.
2. Run `supabase/salesman_profile_only_salary_v55_14.sql` in Supabase SQL Editor as a normal SQL script.
3. Publish the updated `web/` directory to GitHub Pages. The release script mirrors the root source into `web/`.
4. Hard-refresh the site, sign in as a salesman, and verify only **My profile** appears in the sidebar.
5. Test the profile photo and documents, daily stock/sales date selector, monthly boxes/target progress, and salary estimate.

The SQL function update changes the calculation used for unposted salary estimates; it does not change posted salary rows or modify historical sales.
