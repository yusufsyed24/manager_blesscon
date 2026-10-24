# BCBM v55.92 — Daily closing no longer includes salesman collection accounts
- Closing the day (Admin/Manager) now submits only the business accounts (MCB Bank, Cash in Hand, Easypaisa, JazzCash, Al Habib Bank, etc.).
- "Salesman Collection — <name> (<method>)" accounts are no longer submitted and are hidden from the Daily closing register. Salesmen close their own collection accounts from their own login.
- No database migration required. Rows already created today remain in the database but are hidden from the register.
