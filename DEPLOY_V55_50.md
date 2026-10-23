# Deploy v55.50 — salesman commission basis

1. Back up the Supabase database and current GitHub repository.
2. Run `supabase/salesman_commission_basis_v55_50.sql` in Supabase SQL Editor.
3. Deploy the ZIP contents to the existing GitHub Pages publishing root.
4. In Admin → Users & Access, create a salesman and select Fixed salary or Commission basis.
5. For commission basis, enter each product's commission per carton in rupees and create the login.
6. Sign in as that salesman and review Profile & Fieldwork → Salary/commission overview.

Fixed-salary employees continue using the existing salary calculation. Commission is based on confirmed personal orders for the current month, converted from boxes to cartons using each order item's `boxes_per_carton` or the configured default. Do not release payroll until the figures have been checked against known orders.

This build does not alter the salary release process. It adds a commission earnings view; historical rates are not versioned, so changes to rates apply to current calculations and do not reconstruct past rate settings.
