# Deploy BCBM v55.68

1. Back up current deployment.
2. Extract this ZIP and upload contents using the normal static-folder Cloudflare deployment.
3. Hard-refresh with Ctrl+F5.
4. Test Create Login with a test salesman: choose Commission basis, confirm monthly target is hidden, set product rates, save, and verify the linked employee sees commission details.
5. Test Edit Salary for the same test salesman; switch basis and save/reopen. Confirm monthly target stays unchanged when hidden.
6. Verify Fixed salary still shows its target and fixed-salary fields.
7. Before releasing payroll, verify the database payroll calculation and RLS use the saved salary_basis. This build does not modify database RPCs or SQL payroll logic.

No database migration is included. Static syntax/archive checks do not verify live Supabase behavior.
