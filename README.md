# Blesscon Candy Business Manager — v54 Revamp Build

This package is an upgrade of the supplied Blesscon Candy Business Manager repository. It preserves existing product pricing and stock update workflows and does not reset existing business records. Review `CHANGELOG.md`, `DEPLOY_V54.md`, `ROLE_MATRIX_V54.md`, and `TEST_REPORT_V54.md` before deployment. The migration must be tested against a staging Supabase project; this build has not been live-verified.

---

# manager_blesscon

## v42 migration compatibility note
The v40 migration now recognizes an existing `private.save_master` implementation that already grants manager expense access. It no longer aborts solely because the manager permission condition was patched previously. Run `supabase/manager_closing_expenses_v40.sql` once in Supabase SQL Editor; do not run the standalone v41 wrapper first. This package has not been applied to or verified against the live Supabase project.
