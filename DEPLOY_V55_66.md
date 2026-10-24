# Deploy BCBM v55.66

1. Back up the current deployed folder.
2. Extract this ZIP and upload the static files using the usual Cloudflare folder deployment.
3. Hard-refresh with Ctrl+F5. If the old UI remains, clear the site's cached data/service worker and reload.
4. Open Admin → Edit Salary. The Salary payment method selector should stay in the same position. Fixed salary fields or commission rate fields appear underneath it depending on the selected option.

No database migration is intended for this UI-only change. JavaScript syntax and ZIP integrity were checked; live Supabase and browser behavior were not verified here.
