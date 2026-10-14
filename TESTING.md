# Testing and validation status

Date: 14 October 2026

## Current work-in-progress build

The new regression tests have been added, but the full suite has **not** been executed. The environment has no usable `node_modules/typescript` or Vitest installation, and `npm ci --ignore-scripts` did not complete.

Executed checks:

- `node --check` passed for JavaScript files under `js/` and `tests/`.
- `node scripts/release.mjs` completed and copied the root source tree into `web/`.
- Root and `web/` copies of the edited `app.js`, `store.js`, and `documents.js` are synchronized.

Blocked / not run:

- `node scripts/check.mjs` — blocked by missing TypeScript dependency.
- `npm test` — blocked by missing Vitest dependency.
- SQL tests in PGlite/PostgreSQL and live Supabase Auth/PostgREST tests — not run.
- Browser/mobile UI and PDF visual acceptance tests — not run.

Regression coverage added (not yet executed):

- Order payment statuses, invalid partial amounts, and offline/local atomic state behavior.
- SQL order-payment retry idempotency and rollback on invalid partial payment.
- Product fields and restoration of a soft-deleted tier via `product.save`.
- Initial payment during quotation conversion.
- Registered document template rendering and delivery-challan price suppression.

## Required local verification

Use Node.js 22 or newer, then run:

```sh
npm ci
npm run check
npm test
```

Do not deploy this work-in-progress build to production until those commands pass and the remaining gaps in `CHANGELOG.md` have been reviewed. Syntax checks alone do not prove database transaction correctness.
