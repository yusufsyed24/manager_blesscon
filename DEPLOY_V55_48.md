# Deploy v55.48

1. Back up the repository before replacing files.
2. Deploy the contents of this ZIP to the same GitHub Pages publishing root used by the working application.
3. Hard-refresh or use a private window after Pages completes deployment.
4. Open Admin → Salary & Payroll and select a month.
5. If a table cannot be read, the page now shows the exact Supabase error. Resolve the relevant existing schema migration or Admin SELECT/RLS permissions before releasing salary.

No business-data reset or new SQL migration is required by this client-side patch. Do not run reset scripts to troubleshoot salary values. Validate one unpaid month and one already-released month before payroll use.
