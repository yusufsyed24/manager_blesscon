# BCBM v55.90 — Commission salesmen show cartons sold, not "to go"

For salesmen on **Commission basis** (e.g. Noor Elahi):
- Company target panel → Salesman contribution: shows "X cartons sold" with a "Commission basis" badge. No target and no "cartons to go".
- Salesmen & Targets page: monthly progress shows "X cartons sold · commission basis" (no percentage bar).
- Manager dashboard team table: target shows "Commission basis" and Remaining shows "—".
- Salesman profile: shows one "Cartons sold this month" card instead of target / remaining / achievement.

Fixed-salary salesmen (e.g. Arsalan Khan) are unchanged. Commission salesmen's cartons still count toward the company total.

Admin works with no SQL. Optional: `supabase/manager_read_commission_basis_v55_90.sql` lets Managers see the basis of their own assigned salesmen; without it, Managers see the old display.
