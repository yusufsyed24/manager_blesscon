# Deploy BCBM v55.65

1. Back up the currently deployed static folder.
2. Extract this ZIP and upload the folder contents using the usual Cloudflare static-folder deployment. No Wrangler command is required for this static upload workflow.
3. Hard-refresh with Ctrl+F5.
4. Open Admin → employee/salesman profile → Edit Salary.
5. Select **Fixed salary** and confirm Base salary, Monthly allowance, Incentive per carton above target, and Working days appear. Save and reopen to confirm values persist.
6. Select **Commission basis** and confirm fixed-salary fields disappear and per-product commission-per-carton fields appear. Enter rates, save, reopen, and verify the selected basis/rates persist.
7. Confirm salary-slip/advance-slip screens still load.

The change uses the existing `salesman_compensation_settings` and `salesman_product_commissions` tables; it does not add a database migration. If the existing payroll migration was not applied, apply the project's appropriate payroll migration first. Test with one employee before updating live payroll records.

Validation: `node --check js/app.js` and ZIP integrity check passed. Live Supabase permissions, persisted values, and browser rendering have not been tested in this environment.
