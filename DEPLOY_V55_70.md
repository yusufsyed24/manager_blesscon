# Deploy BCBM v55.70 — Exact Salary Slip Templates

1. Back up the currently deployed folder.
2. Extract the ZIP and upload the folder contents using the usual Cloudflare static-folder deployment.
3. Hard-refresh the site with Ctrl+F5.
4. Open an already released fixed salary and choose View/Print slip; compare it with `Blesscon_Candy_Salary_Slip.docx`.
5. Open an already released commission payment for a commission-basis salesman and compare with `Blesscon_Candy_Salesman_Commission_Slip.docx`.
6. Check the print preview is one A4 page and values are populated correctly before using it for actual payroll.

This is a frontend template change only; no SQL migration is included. `node --check js/app.js` and ZIP integrity checks pass. Browser rendering, exact pixel-level equivalence, and live Supabase data have not been verified here.
