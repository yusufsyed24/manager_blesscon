# Blesscon Candy Business Manager — v53 Revamp Build

## Included in this build
- Salesman overview redesigned around profile identity, quantity sold, target progress, and accountable stock; financial amount cards were removed from this overview.
- Salesman profile is read-only for identity details, profile photo, employment documents, and attendance; the interface directs correction requests to authorized management.
- Added `date_of_birth` to salesman profiles through an additive migration.
- Added effective-dated salesman area assignment records and persistent employee notification records with role-scoped RLS policies.
- Added a database migration to remove legacy self-service write policies for salesman attendance, employee documents, and profile-photo paths, and to restrict private employee document writes to authorized management.
- Existing Product Pricing and Stock Update source workflows and product/stock records are preserved; no product, price, inventory, or financial data reset is performed.

## Important implementation status
This ZIP is a controlled upgrade of the supplied codebase, not proof of live production readiness. The supplied prompt describes a much broader full revamp. The included migration and UI changes are additive, but some requested end-to-end workflows still require implementation/verification before calling the system production-ready, especially manager-driven attendance entry/edit UI, manager upload forms for salesman NIC/education documents, notification compose/read UI, complete area assignment UI, team-target configuration, and live Supabase RLS/storage validation.

## Migration
Apply `supabase/revamp_v53.sql` only after backing up the database and reviewing it against the target Supabase schema. It is additive and does not truncate business data. Do not run against production until the RLS and storage policy checks in `DEPLOY_V53.md` have been completed.
