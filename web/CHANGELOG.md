## Manager team closing, manager expenses and Admin approval (18 October 2026) - v40

- **Manager team closing:** one consolidated closing per manager per business date covering the assigned team's sales, collections (by payment method), expenses and stock movements, plus the manager's own direct sales and unlinked expenses. No dummy salesman is created. New table `manager_daily_closings` (`unique(manager_user_id, business_date)`), RPC `manager_closing_command`, RLS limited to Admin and the owning manager.
- **Manager expenses:** managers can open Expenses, view their own and their team's entries and add daily expenses. Enforced in the database: `private.save_master` patch (own entries only, team-linked only, no salary postings, no future dates), scoped `manager_expense_visible()` read policy and snapshot, receipt-upload storage policy. Delete stays Admin-only.
- **Admin approval:** submitted manager closings appear for Admin under *Manager team closings* with Approve / Reject (reason required) / Reopen (reason required). Decision, decision-maker and time are stored; a rejected or reopened closing can be resubmitted by the manager.
- **Day lock:** a submitted/approved manager closing locks covered orders, payments and expenses until Admin rejects or reopens it.
- **v39 fix re-applied to the published folder:** `netlify.toml` publishes the repository root, but the v39 app change had only been made in `web/js/store.js`. Root `js/` is now patched and `web/` re-synced.
- Migration: `supabase/manager_closing_expenses_v40.sql`. Deployment steps: `DEPLOY_V40_MANAGER_CLOSING.md`.
- Validation: see `TEST_OUTPUT.txt`. The SQL migration and the PGlite suite (`tests/manager-closing-db.test.js`) were written but could not be executed in the build environment.

## Manager can submit daily closing (18 October 2026) - v39

- **Root cause:** `closing.submit` allowed a manager only for salesmen whose `manager_user_id` equalled that manager. Salesmen with no manager assigned (or assigned to someone else) were rejected with "Only the assigned salesman, their manager, or Admin may submit this closing", even though the closing screen listed them.
- **Fix (app):** `web/js/store.js` now lets a manager submit a closing for any active salesman, matching the company-wide Manager role.
- **Fix (database):** new `supabase/manager_closing_fix_v39.sql` patches `apply_operational_command` the same way (idempotent) and re-applies the manager read policy on `daily_closings`. **Run it once in the Supabase SQL editor, then redeploy `web/`.**
- Approve / reject / reopen remain Admin-only.
- Validation: JavaScript syntax check passed; SQL not executed against a live Supabase project in this environment.

## Cash & Bank Book ledger (17 October 2026)

- Added the mobile-friendly **5. Cash & Bank Book** navigation page for Admin, Manager and Salesman roles. It shows date-based opening and expected closing balances by account, daily receipts/payments/transfers, salesman-held collection accounts, Market Credit receivables, transaction references, CSV export and print.
- Added `supabase/cash_bank_book.sql`: account configuration, append-only ledger entries, idempotent posting keys, database triggers for invoice receivables, payment receipts/recoveries/void reversals and expense postings/reversals, plus management-only transfer/adjustment/account-configuration RPCs and row-level read policies. Added per-account daily actual-count closing records, management approval, variance adjustment posting and a database guard against posting new entries into an approved account/date.
- Payment mode mapping: Cash -> Cash in Hand; Bank/Cheque -> default bank account; EasyPaisa and JazzCash -> their wallets. The payment form now allows choosing a specific receiving account when the migration is installed; the database validates account/method compatibility. Salesmen can submit cash handovers to the office, with equal and opposite seller/office entries. If no account is selected, payments for orders assigned to a salesman post to that salesman's collection account by payment mode until a transfer is recorded.
- Cash transfers post equal and opposite movements. Market Credit is kept as a receivable account and excluded from liquid funds. Salesman accounts are included in liquid funds once and filtered to the logged-in salesman for non-management users.
- Existing transactions are backfilled idempotently when the migration is applied. Four separate collection accounts are created for each active salesman; a trigger creates them for new salesman records. Future destructive resets must clear cashbook entries/closings and salesman-specific accounts before deleting salesman rows. Apply after `schema.sql`, `operational_modules.sql`, and `manager_role.sql` if that optional role migration is used; refresh the app after the SQL finishes.
- Known boundary: supplier/purchase workflows not present in the current app cannot automatically post until those workflows are added. Late entries into an approved account/date are rejected by the database and must be recorded on an open date with the original reference and management approval. No live Supabase migration or production deployment was performed during this change.
- JavaScript syntax checks passed. The full Vitest suite and SQL integration tests could not be run because the dependency install did not complete in this environment; treat the migration as not production-verified until tests and a staging Supabase smoke test pass.

## Stock issue RPC routing fix (16 October 2026)

- **Root cause:** stock issue and stock return commands were sent to `public.apply_command`, but their SQL handlers are implemented in `public.apply_operational_command`. The older RPC returned `Unknown command`, which was incorrectly described only as a missing migration.
- **Fix:** route both online stock operations and queued/offline sync through `apply_operational_command`, alongside daily closing commands. Other command types continue to use `apply_command`.
- **Validation:** JavaScript syntax and source-copy parity checks run for this build; live Supabase execution still requires deployment and a database smoke test.

## Stock issue button and confirmed stock transfer (16 October 2026)

- Added explicit click handling for the **Confirm stock issue** and **Record stock return** buttons so the operation does not depend only on a delegated dialog submit event.
- Stock issue/return forms now keep the dialog open and show the actual validation, permission, warehouse-balance, or Supabase error instead of appearing to do nothing.
- Online stock issues/returns now wait for the `apply_command` RPC to confirm the database transaction before reporting success; earlier queued changes must sync first. Missing/outdated operational SQL is identified in the error message.
- Bumped the service-worker cache and synchronized root deployment copies with `web/`.
- Validation: JavaScript syntax and archive checks passed. Live Supabase transaction behavior remains unverified.

## Salesman field sales and admin fieldwork visibility (16 October 2026)

- Fixed the My profile & fieldwork navigation guard so a salesman is not silently redirected to the dashboard when their linked salesman row is missing; the page now shows the account-link diagnostic instead. Salesman matching compares IDs as strings to avoid UUID/text representation mismatches.
- Salesmen now see only products with positive stock issued to their own account in Products & pricing, Stock & expiry, their profile stock list, and the sale product picker. The quantity displayed is the salesman-held stock ledger balance, never the warehouse balance.
- Added an admin-only fieldwork panel to Salesmen & targets showing salesman profile-photo links, attendance, uploaded employee documents with expiring private download links, customer visits, visit notes, and optional GPS coordinates. Data is loaded from Supabase and surfaces migration/RLS errors rather than silently hiding failures.
- Validation: changed JavaScript passes `node --check`; root deployment copies are synchronized. Supabase permissions and browser-level live behavior still require verification in the target project.

## Daily closing balances (16 October 2026)

- The daily closing form now records **Cash in Bank, Cash in Hand, Cash in Easypaisa, Cash in Jazz Cash and Market Credit** (Rs.). They appear in the Closing register and in the DSR "Daily cash and closing status" table.
- These five amounts are recorded with the closing for reference; they do not change expected cash or the cash variance.
- Run `supabase/closing_balances.sql` once in the Supabase SQL editor (adds five columns to `daily_closings` and patches `apply_operational_command`). Safe to re-run; earlier closings show Rs. 0.00 for the new balances. `operational_modules.sql` includes the same change for fresh installs.

# Changelog — 2.0.0 (14 October 2026)

- Manager role: company monthly target panel, salesman contribution, manager direct sales counted separately (supabase/manager_role.sql).

## Company and manager target attribution (16 October 2026)

- Added a 2,000-carton company target, separate from the existing 130-carton default individual salesman target.
- Overview company progress sums confirmed order-line quantities for the month, so salesman orders contribute to the company target without changing their individual target calculation.
- Added an explicit Manager / direct sale attribution for administrator-entered orders. Manager-direct cartons appear as a separate subtotal and are included once in company achievement; sales assigned to a salesman are not classified as manager-direct.
- Added unit and UI regression coverage for the target calculation and direct-sale selector. Automated tests remain unexecuted where npm is unavailable.

## Operational DSR, stock accountability and daily closing (15 October 2026)

- **Root cause:** the existing schema had one company-wide `stock_movements` table and invoice-linked payments but no salesman location ledger or closing entity. Dashboard summaries could report total company stock but could not reconcile issued stock, seller-held stock or daily cash/stock variance as one connected source of truth.
- Added an additive `supabase/operational_modules.sql` migration for a unique-reference salesman stock subledger, per-day closing records, RLS reads, append-only audit triggers, server-side idempotency, nonnegative warehouse checks, approved-day write locks, and scoped snapshot access.
- Added offline-queueable stock issue, stock return and closing submit/approve/reject/reopen commands. Cartons are converted to whole boxes using each product's pack size. Saleable returns move stock back to warehouse availability; damaged/expired/unsaleable returns reduce saleable total stock. Sales on a product with issued salesman stock deduct that seller's balance; legacy sales without a stock issue remain on the existing company stock ledger.
- Added a DSR calculation and screen for confirmed sales, date-based collections, previous-invoice recovery, new credit, overdue/outstanding, product/customer totals, expenses and tracked stock movements. Product totals allocate invoice discount so they reconcile to net sales. Dashboard now separates sales, collection, previous recovery and credit, and includes issue/return and closing status totals. Added date/salesman filters, CSV export and print.
- Added cash/physical-stock closing submission with variance reason, admin approval/rejection and reasoned reopening. Submitted/approved days block further linked transaction mutations until management reopens them.
- Restricted the operational snapshot and direct SELECT of sensitive product/order-line tables so sales roles do not receive cost or salary fields; corresponding UI columns are hidden without P&L permission.
- Added DSR, local stock projection, PGlite stock/closing/security regressions and DSR navigation coverage. The test harness applies the new migration after `schema.sql`.
- Updated deployment, owner and salesman instructions with migration order and calculation rules.

### Verification and remaining scope

- Editor diagnostics report no errors for changed JavaScript, tests and SQL files. `git diff --check` passed after the final edits.
- `npm test`, `npm run check`, SQL execution and browser/mobile tests have not run because Node.js/npm and a PostgreSQL client are not available in this environment. Do not treat the migration as production-verified until the isolated PGlite suite and staging migration pass.
- Dispatch/delivery status, supplier/purchase ledger, customer multi-invoice allocation, cash/bank transfer records, deposited-cash ledger, route management, payroll advances/deductions, returns against customer invoices, and automated backup/restore remain outside this implementation.

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

## Fix: product create/update always failed (root cause found and reproduced)

- **Root cause:** in `public.apply_command` (`supabase/schema.sql`), the `product.save` branch built its result with `from public.price_tiers t`, but the function also declares a variable named `t`. PostgreSQL raised `column reference "t" is ambiguous`, so every product create/update was rolled back. Reproduced against PostgreSQL 16 before the fix; create, update-with-tiers and update-clearing-tiers all succeed after it.
- **Fix:** alias renamed to `pt`. For an existing Supabase project run `supabase/fix_product_save.sql` once in the SQL Editor (no front-end change needed; hard-refresh the app).

## Product create/update reliability follow-up

- **Root cause identified by reviewing the uploaded source and form behavior:** the product form marked every tier minimum, label, and rate as HTML `required`, even when “Use product-specific wholesale tier overrides” was unchecked. Browsers can block form submission before the app's save handler runs, so no inline error appears and the user can experience a Save button that does nothing. Tier fields are now disabled and non-required unless the overrides checkbox is enabled.
- **Database root cause addressed:** the `apply_command` PL/pgSQL function used the generic variable name `t` for table selection, which can collide with SQL identifiers in its static SQL expressions and was associated with the reported `column reference "t" is ambiguous` error. It is now renamed `v_table_name`. The existing-installation migration now carries the same complete `apply_command` function as `schema.sql` rather than a stale shortened copy.
- **Save handling:** when online, `product.save` first attempts to drain queued changes and refuses to report success while any queued mutation remains; it then waits for the RPC, refreshes the authoritative snapshot, and surfaces the actual Supabase error in the open form.
- **Regression coverage added:** local create-without-overrides and update-of-expiry/price cases.
- **Verification limitation:** this environment has no installed Vitest dependencies; dependency installation timed out. JavaScript syntax checks and release-copy checks were run, but the automated suite and a live Supabase save were not run here. The SQL migration must be applied to the existing Supabase project for the server-side fix to take effect.


## Product save hardening — 2026-10-14

- **Reproduction status:** The user's live Supabase environment is not accessible from this workspace, so the exact live network/SQL rejection could not be reproduced here. The packaged project did contain a false-failure path: `product.save` treated a successful `apply_command` RPC as failed if the subsequent `business_snapshot` refresh failed. That could leave a committed product while the dialog reported an error, making retries confusing and stale.
- **Fix:** After Supabase confirms `product.save`, the client now applies the returned saved product and tier rows to its local base state before refreshing. A refresh failure is reported as a refresh warning and does not misrepresent the committed product write as rejected. RPC rejection still keeps the dialog open and shows the server message.
- **Validation:** Added explicit client-side checks for non-negative integer-paisa cost/retail/wholesale values and valid tier rates/minimums.
- **Database fix:** `product.save` now validates required fields server-side and returns clear errors for an ID already in use, including an ID held by a soft-deleted product. Product and tier writes remain within the same `apply_command` transaction. Updated both the full schema and the existing-installation migration.
- **Build validation:** JavaScript syntax checks and local product create/update smoke checks are run for this build. Full Vitest/PostgreSQL/live-Supabase validation is not claimed unless those environments are available and the tests actually run.

## Product form submit fix (2026-10-14)

- **Observed symptom:** the Products & pricing Save button could appear inert when a browser-native `required` / `min` constraint failed. In that case, the browser does not dispatch the form `submit` event, so application validation and its inline error handler never run. This is especially confusing when product-specific tier fields are enabled and an existing tier label/rate is invalid.
- **Fix:** product/master form now uses `novalidate` and an explicit submit button so every attempt reaches the app's validation path. Required product fields and tier rules are checked in JavaScript; errors are displayed inline while preserving the dialog and entered values. Missing cost/retail/wholesale values now produce a clear message rather than being silently treated as zero. The inline error clears as the user edits fields.
- **Regression coverage:** added a UI test asserting the product form bypasses silent browser-native blocking and successfully creates a product in the offline practice workspace.
- **Limit:** this reproduces and fixes the frontend's silent-submit failure mode. A live Supabase write still depends on the deployed `product.save` SQL migration and admin permissions; those cannot be verified without access to the user's project.

## 2026-10-14 — Product Save compatibility hardening

- **Reported symptom:** the owner reports that Save in Products & Pricing still appears not to create or update products. This symptom could not be reproduced against the owner's live Supabase project because no live database credentials/session are available.
- **Likely deployment root cause addressed:** a frontend using `product.save` against a previously deployed `apply_command` function that predates that command returns `Unknown command`. Earlier builds surfaced that database rejection but still left the user blocked until SQL was migrated.
- **Fix:** when (and only when) Supabase returns `Unknown command` for `product.save`, the client falls back to the existing `master.save` and `master.delete` commands for the product and tier rows. Other errors are not swallowed. Missing RPC/schema-cache errors now explain that the SQL migration and PostgREST schema reload are required.
- **Cache:** bumped the service-worker cache namespace so the next deployment installs the current static files rather than retaining the previous build's cached asset set.
- **Regression test:** added `tests/product-save-fallback.test.js` to simulate the old server command and verify a product is saved and refreshed in the client state.
- **Limitations:** the compatibility path is sequential rather than atomic; the recommended permanent fix remains applying `supabase/fix_product_save.sql` so `product.save` runs transactionally. This build has not been tested against the owner's live Supabase instance.

## 2026-10-14 — Explicit Products & Pricing Save click path

- **Reported symptom:** clicking Save in Products & Pricing produced no visible action and no useful error.
- **Root cause addressed:** the product form was relying exclusively on delegated native `submit` handling for a dynamically-created modal form. In deployments where that submit event does not fire as expected, the save routine is never invoked.
- **Fix:** added a capture-phase click handler specifically for `#master-form button[type=submit]`; it prevents duplicate native submission, calls `saveMaster()` directly, disables the button while saving, and displays “Saving…” plus any error in the form. The existing submit path remains for keyboard/form submission.
- **Validation:** `node --check js/app.js` and `node --check web/js/app.js` pass; `scripts/release.mjs` regenerated `web/` and `cmp` confirmed the copies match. This is not a live Supabase integration test; deploy and verify in the target environment.

## Salesman self-service portal (2026-10-16)
- Added a salesman-only My Profile & Fieldwork screen with personal sales/target overview, product-wise held stock, profile photo upload, private employee document upload, attendance check-in/check-out, and opt-in GPS customer visit recording.
- Added `supabase/salesman_self_service.sql`, an additive migration for attendance, employee document metadata, customer visits, private employee storage, and ownership-scoped RLS policies. Apply this migration in Supabase before using the new features.
- Photo/document upload requires the private `employee-private` storage bucket and migration policies. GPS is requested only when the salesman explicitly chooses Save visit with my location.

## 2026-10-16 — Salesman account linking and dropdowns
- Creating a login with the `salesman` role now creates and links a salesman profile when an existing salesman was not selected.
- The Users & Access editor now supports linking an existing unlinked salesman profile or creating a profile for an existing salesman login that was previously unlinked.
- Saves the salesman profile through the existing admin command path, then refreshes the snapshot so the salesman appears in Salesmen & Targets, stock issue/return selectors, and sales assignment dropdowns.
- Synchronized root deployment JavaScript with `web/js/app.js` and bumped the service-worker cache version to force updated assets to load.
- Validation: JavaScript syntax checks passed. Live Supabase and full integration tests were not run in this environment.

## 2026-10-16 — Fix salesman login `heldStock is not defined`
- **Reported symptom:** salesman login crashed while rendering the dashboard/profile/product and stock views with `heldStock is not defined` (JavaScript identifiers are case-sensitive).
- **Root cause:** several salesman UI views called `heldStock(productId, salesmanId)`, but no helper with that name was declared in `app.js`.
- **Fix:** added the missing helper to calculate each salesman’s net held boxes from only that salesman’s stock movements for the requested product. It returns zero when the product or salesman ID is unavailable and does not expose warehouse or another salesman’s stock.
- **Cache/deployment:** synchronized root and `web/` copies and bumped the service-worker cache namespace.
- **Validation:** `node --check` passed for all JavaScript files under both `js/` and `web/js/`; root and `web/` `app.js` hashes match. Live Supabase login was not available for integration testing.

## 2026-10-17 — Admin one-click salesman profiles and fieldwork access
- **Reported symptom:** the admin-side profile/fieldwork panel did not load reliably, and admins needed to open a salesman profile directly from Users & Access.
- **UI change:** added a `Profile` action beside `Edit access` for linked salesman logins. It opens a persistent-in-database view of the salesman profile, profile photo, attendance history, uploaded documents (signed private links), customer visits, notes, area and optional GPS details. The view is available again any time from Users & Access.
- **Error handling:** the profile view reports which section failed instead of hiding all other details when one table fails; missing salesman links direct the admin to Edit access.
- **Database migration:** reasserts authenticated SELECT grants and admin/owner-scoped read policies for `salesmen`, `attendance_records`, `employee_documents`, and `customer_visits`, then asks PostgREST to reload its schema cache. This migration is additive and safe to rerun.
- **Deployment/cache:** synchronized root and `web/` app files and bumped the service-worker cache namespace.
- **Validation:** `node --check` passed for all JavaScript files in `js/` and `web/js/`; full tests/live Supabase access remain unverified in this environment.


## 2026-10-17 — Admin profile and fieldwork reliability (v11)
- Fixed the admin fieldwork panel so a failure in attendance, documents, or customer visits no longer hides every other section. Each failing section now reports its own error while available sections remain visible.
- Profile photos now display as actual image previews in the admin fieldwork panel and in the individual salesman profile modal, with a full-size link. Added a fallback to locate older `profile-*` uploads in the employee-private bucket when a salesman record has no saved `photo_path`.
- Added responsive layout styling for the admin photo cards.
- Bumped the service-worker cache namespace and synchronized root/web copies for Netlify's root publish configuration.
- Local validation covers JavaScript syntax and ZIP integrity; live Supabase permissions and deployed hosting still require verification in the user's environment.

## 2026-10-17 — Fixed v12 admin My Profile & Fieldwork routing
- Admin users can open My profile & fieldwork without requiring a linked salesman record.
- Admin page now displays the signed-in administrator identity and a dedicated consolidated salesman fieldwork/profile-photo panel.
- Admin fieldwork hydration runs on both My Profile & Fieldwork and Salesmen & Targets.
- Root and web app/service-worker copies are synchronized; cache namespace bumped.


## 2026-10-17 — Administrator profile picture upload (v13)
- Added a profile-picture upload control to the administrator's My Profile & Fieldwork page.
- Uploads JPG, PNG, and WebP files up to 5 MB to the private `employee-private` bucket under the signed-in admin's own user-ID folder.
- Saves the private object path in `profiles.avatar_path`, displays a signed preview, and limits profile-row updates through an own-row RLS policy and column-level grant.
- Added the column to the base schema and to the re-runnable self-service migration; synchronized root/web app files and bumped the service-worker cache namespace.
- Local JavaScript syntax and archive checks are run for this build; live Supabase permissions/storage are not available for testing here.


## 2026-10-17 — Salesman check-in location in admin profile (v14)
- Salesman check-in requests browser GPS permission and saves coordinates/accuracy when available; attendance can still be recorded if GPS is declined or unavailable.
- Admin attendance tables and individual salesman profiles show a Google Maps link plus coordinates for check-ins where location was recorded.
- Added idempotent migration statements for check-in latitude, longitude and accuracy columns; synchronized root/web app and service worker copies.
- Existing attendance rows and check-ins without GPS remain valid and display “Location not recorded.”


## 2026-10-17 — Admin avatar schema-cache migration (v15)
- Added a standalone, idempotent `supabase/fix_admin_avatar_path.sql` migration for deployments whose live `profiles` table or PostgREST schema cache does not yet expose `avatar_path`.
- Migration ensures the column and scoped own-row update policy exist, grants the required column privileges, and requests a PostgREST schema reload.
- Updated service-worker cache namespace and synchronized root/web copies. Live Supabase schema changes must still be applied by the project owner.


## 2026-10-17 — Cash & Bank Book navigation fix (v17)
- Fixed the blank/non-opening Cash & Bank Book page: the `cashbook` route was present in navigation and access rules, and `renderCashBook()` existed, but the page renderer was missing the `cashbook: renderCashBook` dispatch entry.
- Added the Cash & Bank Book page to the sidebar navigation regression test and asserted that it renders the expected heading.
- Bumped the service-worker cache namespace so deployed browsers fetch the corrected app code.
- Live deployment and live Supabase access remain unverified.


## v18 — Salesman profile & fieldwork permission fix

- Fixed a migration-order conflict: `operational_modules.sql` revoked `SELECT` on `public.salesmen` after the self-service migration granted it, causing `permission denied for table salesmen` in the admin profile/fieldwork panel.
- Kept direct `salesmen` SELECT available to authenticated sessions while relying on RLS policies to restrict rows to admins and the linked salesman. Product and line-item reads remain scoped through RPCs.
- Added `supabase/salesman_self_service_permissions_fix.sql` for existing deployments; run it after the other migrations.
- Updated setup instructions. No live Supabase database was modified by this package change.


## v25 — Cash & Bank Book receivables reconciliation

- Calculate Market Credit outstanding per confirmed invoice using non-voided payments through the selected date, matching invoice-level outstanding logic and preventing one overpaid invoice from making the total receivable negative.


## v26 — Cash Book receivable account balance

- Fixed the Market Credit — Receivables account row to derive opening and closing balances from confirmed invoices and non-voided invoice payments as of the selected business date, matching the receivables summary.


## v29 — Market Credit opening display fix

- Fixed the Account Balances table to render the invoice-based prior-day opening value for Market Credit, rather than recalculating it from the legacy receivable ledger. Other accounts retain their existing ledger-based opening calculation.


## v30 — Admin-only bank account editing

- Added an Edit action for bank and wallet accounts in Cash & Bank Book, visible only to administrators.
- Edit form keeps account keys fixed and permits administrators to update display names. Existing store-level admin validation remains in place; ledger-history protections continue to prevent unsafe opening-balance or account-mapping changes.
- Non-admin users do not receive account edit controls.
