# Testing record — 14 October 2026

## Executed result

**32 automated tests passed across 13 test files. No failed or skipped tests in the final run.**

Commands executed from the project folder:

```text
npm run check
npx vitest run --reporter=default --reporter=json --outputFile=tests/results.json
npm run release
```

The machine-readable result is `tests/results.json`. Syntax checks, TypeScript transpilation for the Edge Function, local asset existence, public-config inspection and the ≤60 KB logo check also passed. The release command copied the static app to `web/`; it does not compile the app or deploy it.

## Acceptance matrix

| Requested test | Result and evidence | What is not yet verified |
|---|---|---|
| 1. Supplied workbook → 37 products, every page, no duplicates | **Synthetic equivalent passed.** Header detection at rows 3/7, cached cost formula, uncached rate recovery, 500 empty formula rows skipped. One PostgreSQL import transaction produced 37 products, 148 tiers, order/item/invoice/payment/expense records. Re-import kept business key counts unchanged. Opening-stock update to zero produced the correct compensating adjustment. All sidebar pages navigated in DOM tests. | The specifically named workbook was unavailable. Its actual 37 products, 120 orders or other claimed counts were not verified. No claim that its exact layout/import passes. |
| 2. Rani pricing | **Passed.** 3 Strawberry + 3 Orange → 230/box; 25 → 225; 50 → 220; 4 → 230; retail → 250. Loose boxes, custom defaults, non-Rani prices and override rejection included. Live DOM editor changed both lines to tier 6–24. | Full mobile-browser input interactions. |
| 3. Targets/carry | **Passed.** 130 ÷ 26 = 5; day-one sale 3 → day-two target 7; sale 7 → day-three target 5, in JS and PostgreSQL. Month-end roll/reset and salary slab tested in JS. Cancelling past sales removed achieved cartons in SQL. | Cron was not deployed; the implemented on-load/sync recalculation needs live verification. |
| 4. Quotation lifecycle | **Passed in PostgreSQL.** Create, edit/revision, convert, one stock deduction, linked records, repeat-conversion rejection, draft soft/hard delete. | Live Auth/PostgREST round trip. |
| 5. Payments/signatures | **Passed.** Rs.100,000 → unpaid; Rs.40,000 payment → part paid/balance Rs.60,000; remaining Rs.60,000 → paid. Overpayment and cancellation with payments blocked. HTML blocks changed by status. Actual unpaid/partial/paid PDFs generated. | Real collection entry on deployed phone; mobile file-share handoff. |
| 6. Logo/offline documents | **Partially verified.** Login/sidebar data-URI logos inspected by DOM tests. JPEG is 34,673 bytes. Actual invoice and quotation PDFs include embedded image objects. PDFs were rendered with Poppler and visually inspected; embedded document font fixed a font-substitution problem. No network fetch is needed for embedded branding or bundled PDF code. | Actual browser offline reload, service-worker lifecycle and print preview. |
| 7. Expenses/P&L | **Passed.** Adding Rs.20,000 reduced net by exactly Rs.20,000; deleting restored it. Cancelled revenue excluded. | Live private receipt-image upload/download and live chart rendering. |
| 8. Non-admin security | **Passed in PostgreSQL/PGlite with separate authenticated roles.** Salesman reads only own orders/customers; Settings rows unavailable; direct DML denied; forged salesman/rate and deletion rejected. All public tables have RLS. Anonymous document access is token-only and redacts costs; revocation invalidates the link. | Must repeat against the deployed Supabase API and Storage. PGlite does not test Supabase's entire service stack. |
| 9. Cancellation/stock | **Passed.** Confirmation deducts once even when retried with the same operation ID. Cancellation reverses stock; SQL target actuals and JS P&L exclude it. Failed stock checks roll back order/invoice creation. | Live simultaneous multi-device requests. Serialisation and stale-version logic are exercised locally, not a production load test. |
| 10. Console/accessibility/mobile | **Partially verified.** All 14 sidebar routes, editor input and sale confirmation ran in jsdom. Login and editor had no serious/critical axe violations in the tested DOM (colour-contrast checks disabled because jsdom has no layout renderer). Responsive CSS contains the mobile layout. | **Lighthouse ≥90 was not run or claimed.** No real-browser console check, 375 px visual test or device touch test. The available managed environment did not provide the required browser-control capability. |

## Additional executed checks

- Legacy JSON migration preserves historical Rs.220 rates and current stock snapshots; second execution creates no duplicate order or stock effect.
- Excel export preserves detected/header layout positions and re-imports a synthetic sale without double stock deduction.
- Offline queue persists across Store recreation, isolates accounts and retries the identical operation ID.
- A server conflict remains queued/visible. Account switching cannot send the previous user's pending writes under a new login.
- Edge handler rejects a foreign origin and wildcard configuration, validates the admin caller and rejects invalid input. The TypeScript transpiles. Its deployed Deno/Auth integration was not exercised.
- Single and multi-page PDFs are actual generated PDF bytes. Image objects and page count were inspected; text was extracted with pdftotext. Invoice layouts were visually reviewed after rendering. Quotation acceptance blocks are covered by the generator test.
- The configured browser libraries are local files. Production credentials are absent; no service-role key is in browser configuration.

## Test files

| File | Tests |
|---|---:|
| schema.test.js | 1 |
| import.test.js | 2 |
| import-db.test.js | 1 |
| pricing.test.js | 6 |
| transactions.test.js | 6 |
| targets.test.js | 3 |
| targets-db.test.js | 1 |
| migration.test.js | 1 |
| documents.test.js | 2 |
| export.test.js | 1 |
| offline.test.js | 3 |
| ui.test.js | 4 |
| edge.test.js | 1 |
| **Total** | **32** |

The fixture products, shops, employees and invoices are test-only. Generated QA PDFs are not business invoices and are excluded from the release ZIP. Running the tests regenerates them under `tests/output/`.

## Live manual click-through checklist — NOT EXECUTED

Use a disposable Supabase project before production. All boxes below remain unchecked intentionally.

- [ ] Run schema.sql, first_admin.sql and the deployed Edge Function. Confirm no Supabase SQL/Edge errors.
- [ ] Configure app_config.js, deploy `web/` to Netlify and sign in as owner.
- [ ] Import the **actual** connected workbook. Reconcile its product/tier/order/expense counts, stock and receivables to Excel. Re-import and check no duplicate business keys. Review every warning.
- [ ] Create two salesmen and logins. Open separate private browser sessions. Verify each sees only its own records. Repeat direct REST/RPC attempts to read/change the other user's records.
- [ ] Attempt Users/Settings and deletion as salesman; confirm server rejection. Deactivate a salesman and verify further writes are blocked.
- [ ] Create mixed-flavour invoices at 4/6/25/50 cartons and retail. Check loose-box boundaries and admin overrides.
- [ ] Confirm an order, edit a past order and cancel one. Verify exact stock, target and P&L effects.
- [ ] Create/edit/send/accept/convert a quote, then try converting twice. Test both preserve-rates and re-price options.
- [ ] Record unpaid/part-paid/paid examples. Review PDF and print preview, payment dates, signatures and balances.
- [ ] Test public-link access signed out, redaction, rotation, expiry and revocation.
- [ ] Upload a receipt; verify another salesman cannot read it. Add/edit/delete Rs.20,000 expense and reconcile P&L.
- [ ] Post salary twice for the same month; verify the duplicate is blocked. Check prior-month auto-post only if enabled.
- [ ] At **375 px**, navigate every page and dialog. Verify forms, line removal, table scrolling, keyboard focus, charts and print output. Test Android/iPhone PDF sharing.
- [ ] Disable network after a successful login/load. Save a sale and payment, close/reopen the page, reconnect and verify one server record/stock deduction per action. Repeat with a stale concurrent edit and account switch.
- [ ] Confirm zero browser-console errors. Run Lighthouse accessibility in Chrome; achieve **≥90** before production sign-off. Review contrast manually.
- [ ] Export Excel/JSON, verify essential totals, and keep a backup outside the device.

## Known verification limits

Missing source files and account access prevent full acceptance sign-off. The release is tested source, not a certification that the user's live business data, deployment or all browsers have passed. Do not interpret an unchecked item as completed.
