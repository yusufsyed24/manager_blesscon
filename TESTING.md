# Testing and deployment status

## Product save hardening — 2026-10-14

- PASS: `node --check` for every JavaScript file in `js/`, `tests/`, and generated `web/js/`.
- PASS: root and deployed `web/` copies of `app.js`, `store.js`, and `documents.js` match.
- PASS: `node scripts/release.mjs` generated the static deployment tree.
- PASS: standalone local smoke test created a product, then updated its name, expiry date, and wholesale price without duplicating the product.
- PASS: `supabase/schema.sql` and `supabase/fix_product_save.sql` contain the same `apply_command` function body and the new `product.save` validation.
- Added Vitest regression coverage for Supabase rejection and a committed save followed by a failed snapshot refresh.
- BLOCKED: `npm test -- --reporter=dot` could not run because Vitest is not installed (`vitest: not found`).
- BLOCKED: `npm run check` could not run because the TypeScript package is unavailable.
- NOT RUN: live Supabase save/permissions/schema verification; no live project credentials were available.

## Deployment requirement

For an existing Supabase project, run the entire `supabase/fix_product_save.sql` in Supabase SQL Editor, then run `notify pgrst, 'reload schema';`. Deploy the contents of `web/`, preserve the working `web/app_config.js` values, and hard-refresh. A frontend-only deployment is not enough if the database does not yet recognize the `product.save` command.

If a save fails, keep the exact error from the inline product form. If a snapshot refresh fails after the server confirms the save, the app now applies the returned product and tier rows locally and shows a refresh warning instead of misreporting the product write as rejected.
