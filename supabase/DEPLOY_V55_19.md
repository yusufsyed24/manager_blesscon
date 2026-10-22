# Deploy Blesscon Candy Business Manager v55.19

## What changed
- Manager's own direct carton sales are displayed as additional sales only.
- Those cartons do not count toward the team's monthly target, do not increase team achievement, and do not reduce the remaining team target.
- Admin's **Managers & company target** table uses the same rule: team target status and achievement are based on salesman/team cartons only; manager's own sales appear in a separate additional-sales column.
- No Supabase SQL migration is required.

## Publish
1. Download and extract `Blesscon_Candy_Business_Manager_v55_19.zip`.
2. Publish the contents of the extracted project's `web/` folder to the existing GitHub Pages deployment, preserving the site's current folder layout.
3. Open the website and perform a hard refresh with `Ctrl + Shift + R`.
4. Sign in as a Manager and confirm the **Your additional cartons sold** card is separate from **Team achieved (salesmen)** and **Remaining team target**.
5. Sign in as Admin and open the **Managers & company target** module. Confirm the **Own sales (additional; excluded)** column is separate and the remaining/achievement columns reflect only team sales.

## Validation status
- JavaScript syntax checks passed for the root and deployed `web/` copies.
- Root and `web/` copies of `app.js` and `domain.js` are synchronized.
- ZIP integrity check passed.
- The full Vitest suite was not run because `vitest` / project dependencies are not installed in this environment.
- This package has not been deployed to the live website; no live database was changed.
