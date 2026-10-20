# Deploy v55.8 — password reset, duplicate salesmen, manager product lines

Do the steps in this order. Nothing here resets business data.

## 1. Supabase SQL (SQL Editor → New query → paste → Run)
File: `supabase/fix_manager_workflow_v55_8.sql`
- Lets an active Manager read products, price tiers and warehouse stock (cost price stays hidden).
  This is what makes **product lines appear in the Manager's sales order**.
- Removes duplicate salesman rows that have no login and no history. Duplicates that DO have
  history are listed in the NOTICE output; merge those by hand.
- If it stops with "could not find the products clause", send me the output of
  `select pg_get_functiondef('public.business_snapshot()'::regprocedure);`

## 2. Edge Functions (fixes "unable to change password")
```bash
supabase link --project-ref ggfjddhqevcvosxberua
supabase secrets set ALLOWED_ORIGIN="https://yusufsyed24.github.io"
supabase functions deploy admin-reset-user-password --no-verify-jwt
supabase functions deploy admin-create-user --no-verify-jwt
```
- `ALLOWED_ORIGIN` must be the exact site origin (no path, no trailing slash). For several
  sites use `ALLOWED_ORIGINS` with commas, e.g. the GitHub Pages URL and blessconcandy.com.
- All the functions now answer the browser preflight correctly and accept a comma list.

## 3. Website
Upload the `web/` contents (and root `js/` mirror if your host serves it), then hard refresh
(Ctrl+Shift+R). The app shows v55.8 in its config.

## 4. End-to-end test
1. Admin → Users & access → **Reset password** on a Manager. A dialog opens; set a 12+ char
   password. Sign in as that Manager with it.
2. Admin → Create login (role salesman, pick that Manager). Type a name that already exists
   as an unlinked profile: it is now reused, not duplicated.
3. Manager → Overview shows each assigned salesman once.
4. Manager → New sale: the **Product** dropdown lists active products.
5. Salesman login → sees own stock and can sell; Manager sees the order; Admin sees all.

## Known intended behaviour
Managers create **direct sales** (no salesman picked); salesman orders are made by the
salesman. Manager password changes are by Admin only, per the role matrix.

## Import fix (v55.8b)
- Products with a blank wholesale rate (non-Rani) now import using their retail rate, with a
  warning per product listing the row to correct. They no longer block the whole import.
- The workbook's "Order Entry Form" is a single-invoice form (invoice ID in the header), so it
  is skipped with a warning instead of raising an error. Test sales left in it are not imported.
- Tested against Blesscon_Candy_Simple_Sales_Stock_Invoice__version_1__yusuf_fix.xlsx:
  0 errors, 37 products. Cost is 200 on every product in that file; update real costs.
- Upload `web/js/importer.js` (and root `js/importer.js`, `sw.js`), then hard refresh.
