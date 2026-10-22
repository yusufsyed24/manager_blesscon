# Deploy v55.4 — Admin overview and Users & Access update

## What changed

- Users & Access no longer displays registered login email addresses and no longer calls the `admin-user-directory` Edge Function. Password reset remains Admin-only.
- Admin Overview shows current warehouse cartons/boxes, estimated market value, potential gross profit on priced stock, and selected-period expenses, net profit and net loss.
- Products with warehouse stock and missing retail or cost prices are flagged in the market-value card. The estimate is partial until prices are completed.

## Deploy

1. Extract `Blesscon_Candy_Business_Manager_v55_4.zip`.
2. Deploy the static site from the extracted `web/` directory to the same hosting location used for the current app (GitHub Pages in this setup).
3. No SQL migration is required for these changes. No deployment of `admin-user-directory` is required; the UI no longer calls it. Keep `admin-reset-user-password` deployed if Admin password reset is used.
4. Hard-refresh the site with Ctrl+Shift+R, sign in as Admin, and check Overview and Users & Access.

## Validation

- Overview inventory totals are based on current warehouse stock records and each product's boxes-per-carton setting.
- Market value uses saved retail price per box. Potential stock profit is retail minus saved cost per box and excludes operating expenses.
- Period net profit/loss and expenses follow the selected Overview date range.
- Registered email addresses are no longer rendered in the Users & Access page; password reset stays available.
