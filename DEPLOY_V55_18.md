# Deploy v55.18 — Manager's own carton sales

## What changes
The Manager overview now shows:
- configured team monthly target;
- team achievement from the salesmen;
- additional cartons sold directly under the signed-in Manager account;
- combined achievement (salesmen + Manager's own sales);
- remaining target after the Manager's own sales are included.

Only confirmed, non-deleted orders for the current month, created by the signed-in Manager and not assigned to a salesman, count as the Manager's direct sales. Quantities are converted to cartons using the order-line boxes-per-carton value or the configured default.

## Deploy
1. Download and extract `Blesscon_Candy_Business_Manager_v55_18.zip`.
2. Publish the updated contents of the ZIP's `web/` folder to the GitHub Pages deployment location, keeping the root and `web/` files consistent as described in the project README.
3. No Supabase SQL migration is required for this frontend-only change.
4. Open the site and hard-refresh with **Ctrl+Shift+R**. If an old screen remains cached, close the tab and reopen the site.
5. Sign in as a Manager. The overview cards should show the team achievement, own additional cartons, combined achievement and remaining target.

## Validation notes
JavaScript syntax and targeted source regression checks were run. This package has not been deployed to the live site, and no live Supabase data was changed.
