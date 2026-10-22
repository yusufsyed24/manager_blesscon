# Blesscon Candy Business Manager v55.16

## Fix: Admin can access Manage Areas directly
- Added a **Manage areas** action to the Admin Business Overview header so the area catalogue can be created without first navigating to Salesmen & targets.
- Kept the existing Manage areas action on the Salesmen & targets page.
- Bumped the service-worker cache key so browsers fetch the updated UI.
- This is a frontend navigation fix; it does not create areas in the database automatically. If the area catalogue is empty, create at least one active area using Manage areas.

## Validation
- JavaScript syntax checked with `node --check` for root and web app files.
- `node scripts/release.mjs` syncs the static deployment folder.
- Full `scripts/check.mjs` could not run in this environment because the `typescript` package is not installed.
