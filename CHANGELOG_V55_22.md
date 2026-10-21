# v55.22 — Market Credit Receivables History Fix

## Fix
When selecting **Market Credit — Receivables → View transactions**, the transaction section now uses only receivable activity reconstructed from confirmed invoices and their non-voided payments up to the selected business date. It no longer includes bank/cash transactions from the general cashbook ledger.

## Files
- `web/js/app.js`
- `js/app.js` (kept in sync)

## Validation
- `node --check web/js/app.js` — PASS
- `node --check js/app.js` — PASS
- `node scripts/check.mjs` — NOT RUN TO COMPLETION: environment is missing the `typescript` dependency.

## Deployment check
Deploy the updated static app, refresh the browser, then open Cash & Bank Book → Market Credit — Receivables → View transactions. Confirm the list contains invoice receivables and receivable recoveries only, with no MCB/Al Habib/JazzCash/EasyPaisa cash-account activity.
