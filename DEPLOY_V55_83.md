# Deploy BCBM v55.83

1. Back up the current deployed folder.
2. Extract this ZIP.
3. Upload the contents of `bcbm_v568_working` using the normal Cloudflare Pages folder upload process.
4. After deployment, hard-refresh the site (Ctrl+Shift+R) or test in a private window to avoid cached JavaScript.
5. Open Users & Access → Create user + employee profile.
6. With **Fixed salary** selected, commission-per-carton product fields must be hidden and disabled. Select **Commission basis** and those fields should appear; fixed salary, allowance, incentive, working-days, and target fields should be hidden/disabled as appropriate.
7. Repeat in Edit Staff for an existing salesman and switch the salary payment method both ways.

No Supabase SQL migration is required for this UI fix. If the old form still appears after a hard refresh, verify Cloudflare deployed the extracted `js/app.js` from this archive and that the page is not loading an older cached bundle.

Checks performed: `node --check js/app.js` passed; archive integrity checked. Live Cloudflare behavior has not been tested from this environment.
