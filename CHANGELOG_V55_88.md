# BCBM v55.88 — Released advances now appear in Admin Expenses

- Admin → Expenses now also lists every released **Salary Advance** (date, employee, reason, reference, amount, account). Salaries were already listed there under "Salaries".
- Salary Advance rows are display-only: they are not copied into the expenses table, so the cash/bank account is not debited twice. Each row has a "Manage advances" button; edit or reverse an advance from the Advance salary window as before.
- The Period total, the category filter and Export CSV include Salary Advance rows.
- After releasing an advance, the app now opens Expenses showing it, like salary release does.
- Managers do not see advance rows.
- No database migration required.
