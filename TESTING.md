# Testing and deployment status

## Follow-up product-save fix

- `node --check` was run for every JavaScript file in `js/`, `tests/`, and the generated `web/js/` tree.
- Root and `web/` copies of `app.js` and `store.js` were compared and match.
- `scripts/release.mjs` completed and generated the static deployment tree.
- Added two Vitest regression tests covering synchronous Supabase product-save rejection and refresh-after-success.
- **Vitest suite not run:** the project dependencies are not installed in this environment; `npm test -- --reporter=dot` reports `vitest: not found`. An attempt to install dependencies timed out. Do not treat this build as fully test-verified.
- No live Supabase credentials/project were available, so actual database permissions and deployed schema could not be tested here.

## If a product save still fails

The product form now stays open and displays the Supabase error instead of showing a false success. Read the exact error in the form. If the sync banner reports an older pending change, open **Review pending changes** and resolve/discard the failed pending operation before submitting another product write.
