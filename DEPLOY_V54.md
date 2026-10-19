# Blesscon Candy Business Manager v54 — Controlled deployment

## What changed

- Connected Admin → Manager → Salesman workflows for employee assignment, operational targets, attendance, area history, private employee documents and management notifications.
- Added a manager-specific operational dashboard. It does not show financial totals by default.
- Preserved existing product pricing, stock update, orders, invoices, payments, cashbook, offline queue and existing records. No reset is included.

## Required migration order

Use a staging Supabase project first. Take a database backup and keep the previous ZIP available for rollback.

1. Confirm the existing base schema is already installed (`supabase/schema.sql`). Do not rerun the base schema casually on a live business.
2. Confirm the existing operational modules and role migrations used by this installation are applied, including `supabase/operational_modules.sql`, `supabase/cash_bank_book.sql`, `supabase/manager_role.sql`, `supabase/manager_profile_fieldwork.sql`, `supabase/manager_closing_expenses_v40.sql`, and `supabase/salesman_self_service.sql` as applicable to the current schema.
3. Run `supabase/revamp_v54.sql` in the Supabase SQL Editor. Run the file contents, not the filename. Review any error and stop if the migration fails.
4. Verify the new functions and tables using `supabase/verify_v54.sql`.
5. In Admin → Users & Access, create or verify Manager logins. Assign each salesman to the correct manager in Salesmen & Targets. Link a salesman login through Users & Access.
6. In Admin → Salesmen & Targets → Manage areas, create the active area catalogue. Assign each salesman to an existing area using Assign area and an effective date. After the employee login is linked, upload the employee profile photo, NIC and educational/employment documents from the employee profile. Documents remain in the private `employee-private` bucket.
7. Deploy the static files from `web/` to the configured host. Database SQL and Edge Functions remain in the project root and are not needed in the public static folder. Confirm `app_config.js` has the correct Supabase URL and publishable key. Never add a service-role key to client-side files.
8. Sign in separately as Admin, Manager and Salesman and complete the post-deployment checks below.

## Post-deployment verification

- Admin can create a Manager login, create a salesman profile, assign the manager, and link the employee login.
- Manager sees only assigned salesmen in operational workflows and cannot edit salary or login linkage through the employee form.
- Manager can create/edit assigned employee operational details, record attendance, assign effective-dated areas, issue/return stock through the existing stock ledger, and send messages.
- Salesman can see their own profile, assigned areas, attendance history, stock quantities, target progress and management notifications; they cannot edit protected identity documents or attendance.
- Test private photo/document access with an unrelated salesman account. Access must be denied.
- Attempt direct RPC calls as a Manager using a salesman ID from another team for profile updates, area assignment, stock issue/return and order edits; every request must be denied.
- Confirm Managers cannot read global invoice/payment amounts or cashbook balances without an explicit permission, and a granted invoice permission remains scoped to the assigned team.
- Test Product Pricing create/edit/price-tier update and Stock Update on test records. Confirm existing products, price tiers and stock movements are unchanged.
- Test full, partial and unpaid orders; selected-account payment posting; returns/cancellations; and offline sync in staging. Reconcile cashbook and stock movement ledgers.

## Rollback/recovery

- If application issues occur, redeploy the prior static ZIP and clear/refresh the service-worker cache.
- The migration is additive and does not truncate or reset business records. If a database function or policy needs rollback, restore the staging backup or use a reviewed SQL rollback prepared against the exact deployed schema. Do not blindly drop the new tables because audit records may already exist.
- Do not apply unreviewed rollback SQL to production.

## Validation status

JavaScript syntax checks and archive integrity checks are run before release. Automated Vitest and the repository's `scripts/check.mjs` could not run in this environment because the local dependency installation was incomplete. Live Supabase, RLS, private storage, product/stock regression and cashbook ledger tests must be completed in staging; this document does not claim they were performed.
