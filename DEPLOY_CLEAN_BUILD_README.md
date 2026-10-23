# Blesscon Candy Business Manager — Clean Deployment Package (v55.47)

This package removes the duplicate nested application copy, duplicate nested `supabase/supabase/` tree, test fixtures, and development-only artifacts from the prior archive. It preserves the root application entry point and its runtime dependencies, plus top-level Supabase SQL migrations and Edge Functions.

## Deploy to GitHub Pages
1. Back up the current repository first.
2. Extract this ZIP and upload the package contents (not the ZIP file) to the repository root.
3. Confirm `index.html`, `app_config.js`, `js/`, `css/`, `assets/`, and `vendor/` are at the published root.
4. Commit and wait for GitHub Pages to finish deploying.
5. Test in a private window. Do not run SQL migrations merely to fix a static-site entry-point issue.

## Safety note
This package has been structurally reviewed and archive-integrity tested, but it has not been certified by Microsoft Defender or another antivirus vendor. If Defender flags this package, keep it quarantined and submit it for Microsoft review; do not disable protection or add exclusions.
