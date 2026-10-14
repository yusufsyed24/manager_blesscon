# Changelog — 2.0.0 (14 October 2026)

## Source and delivery boundary

Rebuilt from the available `blesscon_online_backend.zip`. The requested `Blesscon_Candy_Rebuilt.zip` and `Blesscon_Candy_Connected_Workbook.xlsx` were not found after exact and simpler filename searches. The exact `logo_of_blesscon.jpeg` was also unavailable. The existing saved “Centered Blesscon Candy logo on white.png” was resized/compressed without redesign and embedded as the substitute. Original supplied files were not overwritten.

This release is a deployable source package, not a live deployment. Production configuration is intentionally blank. Supabase Auth/PostgREST/Storage/Edge deployment, Netlify, actual mobile rendering and Lighthouse still require the user's accounts/environment. These are not marked passed.

## Fixes against the twelve audit findings

| # | Finding | Implemented change | Executed evidence |
|---|---|---|---|
| 1 | Formula cells blanked on import | Read `.v` caches with formula/date metadata. Build products from Price Codes. Recompute derived quantities/rates/totals from business inputs. Detect headers by aliases. Missing essential formula results block import rather than becoming silent zeroes. | Synthetic import and export/re-import tests |
| 2 | Manual per-sheet saves | One preview, one transactional `import.batch`, one fresh relational snapshot for all pages. | Database import/re-import test |
| 3 | Missing Rani tiers | Shared JS pricing and equivalent SQL validation use total Rani invoice cartons, including loose boxes. Editable default/product tiers; rate snapshots and admin override reasons. | JS tier tests and SQL sale tests |
| 4 | Salesmen only a grid | Create/edit/deactivate, login link, working days/off dates, daily target chain, dashboard, leaderboard, incentives and salary posting. Recalculation runs on sync and relevant writes. | JS and SQL carry-forward/cancellation tests |
| 5 | Missing quotation workflow | Dedicated create/edit/status/delete/convert screens, revisions, validity, linked orders, optional re-price and one-conversion guard. | SQL lifecycle and DOM editor tests |
| 6 | Raw sales rows/basic print | Customer quick-add, salesman/channel/date, searchable products, stock checks, discounts, live tiers, saved costs, PDF/print/share. | Transaction, DOM and generated PDF tests |
| 7 | No payment model | Multiple receipts, paid/balance/credit, status-dependent document stamps/signatures, payment void reasons, customer ledger and aging. | Payment transition, overpayment and document tests |
| 8 | Missing logo | Real saved Blesscon logo in login, sidebar, favicon, HTML documents and PDFs. JPEG 34,673 bytes, data URI and square icon bundled. | DOM, PDF image-object and size checks; PDF rendered and inspected |
| 9 | Weak expense/P&L | Expense forms, category/date filters, CSV, private receipt upload integration, salary expense, saved-cost P&L, prior-period comparison, channel/salesman/product breakdown and charts. | Exact Rs.20,000 profit delta test; DOM navigation |
| 10 | JSON sheet blobs | Normalised relational tables, per-record IDs and versions, audit triggers, transactional command handling and a non-destructive legacy migration. Settings and audit payloads legitimately remain JSON. | PostgreSQL schema, migration, duplicate/retry and stale-edit tests |
| 11 | Setup/offline divergence | One app_config.js, no URL/key login fields, per-user durable write queue, explicit status/conflicts, matching-account sync, cached static dependencies and isolated practice mode. | Offline retry, persistence, account isolation and conflict tests |
| 12 | Security/robustness | RLS on all public tables; direct business DML revoked; validated RPCs enforce ownership. Scoped CORS, admin-only user creation, idempotency, safe HTML escaping, CSRF-resistant bearer auth and server audit history. | Local PostgreSQL RLS/privilege tests and Edge handler CORS/input tests |

## Assumptions and choices

1. **No invented business data.** Production starts empty. The two-product practice workspace and 37-product test workbook are explicitly synthetic and never auto-import into the business database.
2. **Latest contact.** Default phone is +92 341 3905030, with blessconcandy@gmail.com and www.blessconcandy.com. Address, NTN, bank details and signature are blank until the owner supplies them.
3. **Money.** Database values are integer paisa; JS rounds rupee input once. Display uses `Rs.` with grouping and at most two decimals. Quantity fields are whole cartons/boxes; tier-carton totals can be fractional.
4. **Time and targets.** Business dates use Asia/Karachi. Default workweek is Monday–Saturday, carry across month end ON, surplus reduction OFF. A month’s base target uses all configured working days in that month; tracking starts on the joining date. Today/future shortfalls are provisional until closed.
5. **Target import.** Daily Sales is a fallback actual when no detailed orders exist for that salesman/date. When orders exist, their actuals take priority to prevent double counting. No general spreadsheet formula evaluator is used.
6. **Formula limits.** Missing derived sale rates/quantities/totals are reconstructed from product and invoice rules. Missing source IDs, prices or opening-stock formula caches are reported, not invented. Unrecognised sheets/headers remain in the captured layout where possible; unsupported custom calculations need review. The exact missing workbook has not been certified.
7. **Import identity.** Products use Product ID; orders use Invoice ID; receipts and stock use Transaction ID. Missing transaction/expense IDs use a stable source-row key with a warning, so those rows must not be reordered between imports. Re-import never deletes records absent from the source. Adjusted stock imports add compensating movements; original history remains.
8. **Opening stock.** When no opening date is supplied, use 2000-01-01 as a pre-history marker. Historical import may create negative stock with a warning; live sales obey the blocking setting. Do not import both a stock-sale row and its matching order as separate deductions.
9. **Pricing.** Current default boundaries are 0/6/25/50, labelled 1–5/6–24/25–49/50+. Zero includes small loose-box orders. Explicit product tiers override defaults. Non-Rani products use their own wholesale price. Editing a sale recalculates current pricing; unchanged saved invoices never re-price themselves.
10. **Numbering.** New online numbers are allocated in a locked yearly sequence. Imported numbers are preserved. Offline documents show Pending sync until the server numbers them. Practice numbering is local and labelled as practice.
11. **Confirmation.** Saving a sale confirms it and deducts stock. Cancellation is admin-only and requires any recorded receipts to be voided/refunded first. Payment voiding records an accounting reversal; it does not execute a bank refund. Quantity corrections are made by editing the order; a separate credit-note/return-authorisation subsystem is not included.
12. **Payments/credit.** Overpayment is blocked by default. When enabled, excess is displayed as customer credit on the invoice/ledger; it is not automatically allocated to another invoice. Receipt history is retained, with void reasons.
13. **Documents.** Default due date and quotation validity are +7 calendar days. The approved typed signatory/company name is shown for paid receipts; optional approved signature artwork may be uploaded. No personal handwritten signature is fabricated. Invoice layouts preserve historical product names, pack size, rates and cost snapshots.
14. **Sharing.** Read-only tokens last 30 days and can be rotated/revoked. PDF creation uses bundled jsPDF with an embedded font for reliable offline rendering and page-aware row placement. html2canvas is bundled but not required by the native PDF renderer. Mobile file sharing depends on Web Share support; WhatsApp/email otherwise require manual attachment.
15. **Offline scope.** Normal sales, quotes, payments, stock and master/expense entries can queue. Bulk import, account changes, final sharing and receipt-image uploads require connectivity. First login and initial asset caching require connectivity. Pending changes are partitioned by project and account; syncing checks the signed-in user matches the queue owner.
16. **Permissions.** Admins manage all records. Salesmen can read/create/edit their own sales and quotations, and see needed product/stock information. They cannot delete or access Users/Settings tables. Receipt collection is an explicit permission. The older `user` role is retained, with own-sales restrictions plus assigned section permissions.
17. **Concurrency.** Business command transactions serialise on a private lock. This prioritises consistency for a small business. Expected versions reject stale edits. A single database snapshot supplies all displayed sections. Larger deployments can later refine lock granularity without changing the UI.
18. **Legacy migration.** Common object/array/grid payloads are supported and tested against the available starter's shape. Original blobs stay intact. Unknown shapes, missing references and invalid rows are recorded in private.migration_errors. Old frontend data that only exists on another browser must first be exported/staged; SQL cannot read that browser.
19. **Salaries.** Projection/posting is base plus earned incentive. No advance, tax, deduction or mid-month proration engine was requested in this specification. Auto-post, when enabled, posts the prior month's salary once per salesman on owner login. Existing posted payroll is not silently rewritten by later order edits.
20. **Expense storage.** Receipts use a private Supabase bucket, max 5 MB, PNG/JPEG/WebP. Live Storage policy verification is still required after deployment.
21. **Test environment.** SQL tests use PostgreSQL in PGlite with Supabase-like auth identities and roles. UI tests use jsdom plus axe (no colour-contrast rendering). These do not establish a Lighthouse score, true browser layout at 375 px, real Auth/Edge integration or actual workbook compatibility.
22. **Deployment delivery.** The requested output is a downloadable project with Supabase/Netlify instructions. It has not been published to an unrelated hosting service or connected to an invented account.


## v3 bug fixes

- **Snapshot/schema cache:** added PostgREST schema reload notification, schema usage grant, and fallback table loading when `business_snapshot` is unavailable. Added `supabase/verify.sql` and setup troubleshooting instructions.
- **Workbook warnings:** added sheet classification so instruction/report tabs are skipped and Settings is parsed as key/value rows rather than header-based data.
- **Order/quotation product picker:** replaced free-text product ID entry with an accessible select, searchable by name/ID, showing product name, ID and rate; empty and missing-product states are explicit.

## 3.1.0 work-in-progress — order payments, atomic product save, templates

### Bug A — payment at sale time
- Root cause: `order.save` had no payment payload and the editor exposed only a later invoice payment form.
- Changes: added sale-time Unpaid / Part paid / Paid in full controls, amount/date/method/reference/receiver fields and a live total/paid/balance summary. Initial payment is included in the same `order.save` command; SQL `apply_command` inserts it in the same transaction as the order and invoice. Offline/local apply uses a single cloned-state operation and a stable payment transaction ID. Partial amounts must be positive and less than the final total; paid-in-full derives the amount from the final total.
- Assumptions: existing `allow_customer_credit` controls overpayment; unpaid sales create no payment row; editing an existing order does not create a new initial payment. Existing later instalment workflow remains.

### Bug B — payment on quotation conversion
- Root cause: `quote.convert` had no payment fields and conversion created no initial payment.
- Changes: conversion dialog accepts payment details, recalculates paid-in-full against repriced total, shows stock availability, and sends payment data with `quote.convert`. SQL creates the order/invoice/stock movement, marks the quote converted, and records any initial payment within the same transaction; failed payment raises and rolls back the conversion. Local apply follows the same all-or-nothing cloned-state path.
- Assumptions/limitations: expired/rejected admin extension flow and automatically opening the new invoice are not fully implemented in this work-in-progress build; the current error remains explicit.

### Bug C — product edit persistence
- Root cause: product fields and tier overrides were saved as multiple independent `master.save` / `master.delete` commands, permitting partial saves and stale tier conflicts.
- Changes: added a single `product.save` command for product fields and all tier overrides; SQL performs the operations in the `apply_command` transaction, validates tier minimums, restores soft-deleted tiers by `(product_id,min_cartons)`, and returns fresh product/tier data. Local apply mirrors validation. Added visible inline master-form errors and activate/deactivate action. Money remains integer paisa.
- Assumptions/limitations: duplicate-product action and a dedicated conflict “Reload latest” button are not fully implemented yet; existing product form continues to use configured settings tier slots.

### Feature D — document templates
- Root cause: document HTML and PDF used one fixed layout.
- Changes: added a template registry and invoice/quotation template selector with instant HTML preview; last choice is stored per user/type and per document. HTML/PDF receive the selected template; added branded, minimal, thermal, wholesale, bilingual, challan, proforma and price-list rendering variants. Delivery challan suppresses customer-facing prices and totals.
- Assumptions/limitations: Statement of Account is currently a document-style view rather than a multi-invoice ledger; per-template settings defaults, watermark/paper/theme toggles, Urdu font proofing, and persisting template choice in shared-link payloads remain incomplete.

### Verification note
- Added regression tests for local order payment states/validation, product save and tier restoration, database order payment retry/rollback and template rendering.
- `node --check` passed for changed JavaScript files. `scripts/check.mjs` and Vitest could not run because dependencies (including `typescript` and `vitest`) are not installed; `npm ci --ignore-scripts` did not complete in the available environment. SQL was not executed against a live Supabase project or PostgreSQL test database. Do not treat this archive as fully acceptance-tested.

## Follow-up fixes — webhook/import, product pricing, and visible payment status

- The legacy workbook's `Salary Rule` row is informational text, not an application setting. The importer now skips it instead of reporting it as an unrecognised key. This addresses the specific Settings warning; if the webhook itself returns a separate HTTP/server error, its response body is still needed to diagnose that distinct issue.
- Product & pricing now shows each product's expiry date in the main list.
- Product-specific wholesale tiers are loaded from that product's saved overrides, rather than only matching the global tier minimums. Tier minimums, labels, and rates can be edited together, including custom minimum-carton thresholds; saving still validates unique minimums and a zero-carton starting tier.
- Sales orders now show a Payment column (PAID / PART PAID / UNPAID) directly in the list, computed from the linked invoice and payment ledger. Recording a collection adds a payment transaction against the existing invoice and should not create another sale/order.
- Added a regression test for the legacy `Salary Rule` workbook row. Full test suite and live Supabase/webhook verification remain unconfirmed in this environment; run tests and verify on a staging deployment before production.

### Follow-up: product creation and existing-order payment access

- **Reproduction status:** the supplied project archive was inspected. The product form required a manually entered Product ID, and the Orders list exposed payment collection only in Invoices & Payments; this explains the reported usability blockers. Live Supabase/webhook reproduction is not possible without the user's project credentials and server response.
- **Product creation root cause addressed:** a blank ID could not pass browser form validation. Product ID is now optional and generates a unique `BC-<CATEGORY>-NNNN` ID based on currently loaded products. Manual IDs are trimmed and checked for supported characters/length and duplicates, including soft-deleted products in the loaded state. The expiry field is normalized to `null` when empty and remains part of the atomic `product.save` record.
- **Existing order payments root cause addressed in UI:** collection was only offered from the Invoices & Payments screen. The Orders list and invoice view now expose `Receive payment` when an invoice has a balance and the user has permission. The dialog shows invoice/customer, total, already paid, balance, status, and a pay-full-balance shortcut. It calls `payment.add` against the existing invoice ID; it does not create an order or invoice.
- **Regression tests added:** local ledger receipt leaves order count and invoice number unchanged; editing an order retains its ID, invoice number and payment rows. These tests are authored but could not be executed because Vitest is not installed in the available environment.
- **Verification:** `node --check` passed for the changed JavaScript files and release sync completed. `npm test -- --reporter=dot` was attempted and failed with `vitest: not found`. Supabase SQL tests/live deployment tests were not run. Do not treat this as a fully verified production release until dependencies and staging checks pass.


## Follow-up: product create/update still appeared to succeed but did not persist

- **Symptom reproduced from the submitted source path:** product saves used the generic optimistic offline queue. If Supabase rejected `apply_command` (for example due to permissions, migration/schema drift, or a constraint), `sync()` retained the failed command and returned without throwing. `saveMaster()` then closed the form and displayed “Saved” even though the server had not accepted the write. This also left an optimistic product in the local view and could poison later saves behind a pending queue error. This is a code-path reproduction, not a live reproduction against the customer's Supabase project; no live credentials/environment were available.
- **Fix:** when online and no older queued mutations exist, `product.save` now calls `apply_command` synchronously, throws the actual Supabase error back to the form, refreshes the authoritative snapshot on success, and only then allows the dialog to close. Product success toast now distinguishes create/update. The existing form submit handler keeps entered values and shows the server message inline on failure.
- **Pending queue note:** if this browser already has an older rejected queued command from a previous build, resolve it through **Review pending changes** before saving another product; queued mutations are intentionally not reordered. The visible sync alert should expose the rejection instead of silently claiming success.
- **Validation limitation:** source-level checks and regression tests are run for this follow-up, but this environment cannot reproduce a live Supabase role/schema configuration. If the server rejects the operation now, the exact rejection should remain visible in the dialog and identify the next root cause to address.
