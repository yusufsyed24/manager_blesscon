# manager_blesscon

## v42 migration compatibility note
The v40 migration now recognizes an existing `private.save_master` implementation that already grants manager expense access. It no longer aborts solely because the manager permission condition was patched previously. Run `supabase/manager_closing_expenses_v40.sql` once in Supabase SQL Editor; do not run the standalone v41 wrapper first. This package has not been applied to or verified against the live Supabase project.
