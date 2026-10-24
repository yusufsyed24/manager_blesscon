# Deploy BCBM v55.73

1. Back up the currently deployed folder.
2. Extract this ZIP locally.
3. Upload the **contents** of the extracted `bcbm_v568_working` folder to the same Cloudflare Pages static upload target, preserving folders. Do not upload the ZIP itself.
4. Ensure `index.html`, `js/`, `css/` (if present), `assets/`, `sw.js`, and other root files are uploaded to their expected locations; don't nest the whole folder one level deeper.
5. Hard refresh with Ctrl+F5. If an old slip is already open, close it and generate a new one after deployment.

Expected: advance slip shows advance date, amount and recovered-so-far; no Balance Remaining column. Advance amount is not salary earnings. Actual salary debt/recovery should appear only as a separately recorded salary deduction.

Validation was static only; live Supabase and browser print were not tested.
