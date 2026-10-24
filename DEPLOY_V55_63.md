# Deploy v55.63

1. Keep a backup of the currently deployed folder.
2. Upload the contents of this ZIP using your usual Cloudflare static-folder deployment (no Wrangler required).
3. Hard refresh the website with Ctrl+F5. If the old UI remains, close/reopen the site after the service worker updates.
4. Open Admin → Users & Access → Create Login, select Salesman, and confirm the prominent Salary payment method selector appears.
5. Select Commission basis and verify the per-product commission-per-carton fields appear. Create a test user only if safe; do not create a duplicate real employee for testing.
6. This is a frontend visibility/UI correction and does not require a new SQL migration if the v55.50 commission migration was already applied. If not applied, run `supabase/salesman_commission_basis_v55_50.sql` before using commission rates.

The build preserves the month-wise salary and advance-slip changes from v55.62. JavaScript syntax and archive integrity were checked; live Supabase permissions and browser behavior were not tested.
