# v55.29 — Manager sales-order price overrides

- Managers can edit the per-box price in Sales Orders, while other non-management roles remain read-only.
- Manual rates require a reason (the UI defaults this to `Manual rate` when a rate is changed).
- Manager edits are saved as the order line's `rate_paisa` and `override_reason`; reopening an order retains the manual rate instead of clearing the override and repricing it.
- Automatic tier/product pricing continues to apply to lines without a manual override.
- Server migration updates the existing `private.save_document` price guard to allow Admin or Manager overrides while preserving existing document/team authorization checks.
- Product pricing master data is not changed by editing an order line.

## Validation

- JavaScript syntax and ZIP integrity checks are run during packaging.
- Pricing unit test added for manager override retention.
- SQL migration is schema-aware via `pg_get_functiondef`, but must be run and verified in the target Supabase project; no live database is available to this build process.
