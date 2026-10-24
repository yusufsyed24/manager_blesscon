# Deploy v55.64

1. Back up the currently deployed static folder.
2. Upload the contents of this ZIP with the normal Cloudflare static-folder deployment; Wrangler is not required.
3. Hard refresh with Ctrl+F5.
4. In Admin → Users & Access, open the linked salesman's Edit, then choose **Edit employee details & salary**. The Salary payment method selector should appear near the salary fields.
5. Choose Commission basis to show per-product commission-per-carton fields. Confirm existing rates load, edit as needed, then Save. Reopen the form to confirm the selected basis/rates persisted.
6. This uses the existing v55.50 commission tables; no new migration is included. If those tables/migration are not installed, apply `supabase/salesman_commission_basis_v55_50.sql` before saving commission settings.

Back up first. JavaScript syntax and ZIP integrity were checked; live Supabase permissions and deployed browser behavior have not been verified.
