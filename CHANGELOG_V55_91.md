# BCBM v55.91 — Commission salesmen fixed everywhere (Admin, Manager, Salesman)

Commission-basis salesmen (e.g. Noor Elahi) no longer show targets, 0.0% achievement or a Rs. 0 salary anywhere.

**Admin → Overview → Team progress**
- Today column: "X cartons sold" (no "/ target").
- Month-to-date: "X cartons sold" (no "/ 1").
- Achievement: "Commission basis" badge (no 0.0% bar).
- Projected salary: commission earned this month (confirmed cartons × per-product rate).
- "Missed targets today" no longer lists commission salesmen.

**Admin**
- Salesmen & Targets: "Today / target" shows cartons sold for commission salesmen.
- Salesman profile and Daily tracking: target/remaining columns replaced by cartons sold.
- Salary & payroll: commission salesmen show gross = commission earned (no base, allowance or carton incentive); "View calculation" shows the per-product commission table.

**Salesman (own login)**
- Dashboard shows "Cartons sold this month" and monthly salary = commission earned; target details and salary breakdown show commission by product.

**Manager**
- Team table already shows "Commission basis" / "—" (v55.90). Requires `supabase/manager_read_commission_basis_v55_90.sql` to be run once; commission rates and amounts stay hidden from Managers.

Fixed-salary salesmen (e.g. Arsalan Khan) are unchanged. No new SQL required beyond v55.90's optional manager policy.
