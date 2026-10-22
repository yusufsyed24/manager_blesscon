# Manager access setup (v3.0.1)

This build prepares the Manager role for company-wide operational visibility, including salesmen hired later. No placeholder salesman accounts are required.

## Supabase deployment

1. Back up the Supabase database before applying SQL.
2. In Supabase SQL Editor, run `supabase/manager_role.sql` after the base schema and operational module migrations have been applied.
3. Ensure the `admin-create-user` Edge Function is deployed from `supabase/functions/admin-create-user` as described in `README_SETUP.md`.
4. Sign in as an admin, open **Users & access**, and create or update the user's role to **manager**.
5. Sign in as the Manager and verify Overview, Daily Sales Report, Daily Closing, Cash & Bank Book, Sales Orders, Invoices & Payments, Quotations, Customer Ledger, Stock & Expiry, Products & Pricing, and Salesmen & Targets.
6. Create real salesman accounts when staff are hired and verify their records appear.

## Important access model

This migration grants Managers **company-wide read visibility** for the operational records covered by its policies. It does not implement per-manager salesman assignment/isolation. Manager direct-sale behavior remains governed by the existing `can_document` logic. Do not use this build if each Manager must be restricted to only their assigned salesmen until a separate assignment-table migration and corresponding RLS changes are implemented.

The migration does not delete business data or change admin roles. Review SQL and take a verified backup before production deployment. Browser code alone cannot grant Supabase access; the SQL migration is required.
