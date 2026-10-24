# Deploy BCBM v55.67

1. Back up the current deployment.
2. Extract this ZIP and upload the contents using the existing static-folder Cloudflare deployment workflow.
3. Hard refresh with Ctrl+F5.
4. In Admin → Salesmen & Targets → Edit Salary, select Commission basis. The monthly carton target field should disappear; product commission rates remain available.
5. Switch to Fixed salary. Base salary, allowance, incentive, working-days fields and monthly target should reappear.
6. Test with one non-production employee first.

No SQL migration is included. JavaScript syntax and archive integrity checks do not verify live Supabase permissions or calculations.
