# Testing status

## Product form submit fix

- `node --check js/app.js`: passed.
- Root/web copies are generated from root using `node scripts/release.mjs`.
- Added a Vitest UI regression for product creation through the form in local practice mode.
- The full Vitest suite must be run in an environment with the dependencies from `package-lock.json` installed. Do not treat this change as live-Supabase verified until a real product create and update are confirmed against the target project.

## Required staging smoke test

1. Sign in as an admin with the updated `product.save` migration installed.
2. Products & pricing → + Product → enter name, boxes/carton, cost, retail and wholesale; save.
3. Edit the new product's expiry date and wholesale price; save.
4. Enable tier overrides and try an invalid tier; verify the dialog stays open and displays an inline error.
5. Confirm the saved product appears in order and quotation product pickers.
