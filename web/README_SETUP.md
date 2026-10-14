# Blesscon Candy Business Manager

A buildless HTML/JavaScript application backed by relational Supabase tables. Currency is PKR; amounts are stored as integer paisa. Business dates use Asia/Karachi.

## What is ready and what still needs your account

The source, database, migration, Edge Function, bundled browser libraries, guides and automated tests are included. **This ZIP is not a deployed or connected service.** No Supabase URL, public key, database access or Netlify account was supplied.

The available input was `blesscon_online_backend.zip`. The specifically named `Blesscon_Candy_Rebuilt.zip`, `Blesscon_Candy_Connected_Workbook.xlsx` and `logo_of_blesscon.jpeg` were not available. The saved Blesscon logo was used as a documented substitute. The 37-product test uses synthetic records; it does not certify your missing workbook.

## 1. Create your Supabase project

1. Open [Supabase](https://supabase.com/dashboard), sign in and create a project.
2. Save its database password securely. Wait until the project is ready.
3. In the left menu, open **SQL Editor → New query**.
4. Open `supabase/schema.sql` from this folder, copy the entire file, paste it into the query and click **Run**.
5. Open **Table Editor**. You should see products, customers, orders, invoices, payments, stock_movements and the other named relational tables.

Screen description: the SQL Editor has a large query area and a **Run** button. The results area must finish without a red error. Do not continue past a SQL error.

## 2. Create the first owner login

1. Open **Authentication → Users → Add user / Create user**.
2. Enter your own email and a strong password. Confirm the email for this owner account if the screen offers that option.
3. Open `supabase/first_admin.sql` in a text editor.
4. Replace `REPLACE_WITH_YOUR_EMAIL` with exactly the email you created.
5. Run that SQL in the SQL Editor. It creates the owner profile and admin role.

Screen description: the Authentication Users table should show your email. Table Editor → user_roles should show its user ID with role `admin`.

Never put the service-role key or database password in the website files.

## 3. Enter the two public configuration values

1. In your project's settings, find its **Project URL** and **publishable key** (or legacy `anon` key).
2. Open `app_config.js`.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` between the quotes.
4. Save the file. The login screen never asks users to type these values.

```js
window.APP_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'YOUR_PUBLIC_PUBLISHABLE_KEY',
  APP_NAME: 'Blesscon Candy Business Manager'
});
```

The values above are examples, not working credentials. Do not use a key starting `sb_secret_` or a service-role JWT.

## 4. Deploy the static site on Netlify

Use the included `web/` folder in the release ZIP. It contains only the files needed by the website. **Copy your edited `app_config.js` into `web/app_config.js` before uploading.**

1. Open [Netlify](https://app.netlify.com/) and choose **Add new project → Deploy manually** (the exact menu label can vary).
2. Drag the entire `web` folder onto the deploy area.
3. Wait for a successful deployment, then open its HTTPS address.
4. Sign in with your owner email/password.
5. In Supabase Authentication URL Configuration, set the Site URL to this HTTPS address.
6. Keep the site on HTTPS. Do not launch the app by double-clicking `index.html`; JavaScript modules and offline caching need an HTTP/HTTPS server.

Screen description: the website should show the Blesscon logo and an email/password form. After sign-in, the sidebar should show the management pages, and the badge should say **Synced**.

For a local technical check, run `python3 -m http.server 8080` from `web/`, then open `http://localhost:8080`. There is no application build step and no need to run npm on Netlify.

If you deploy the root folder through Git, use `web` as Netlify's publish directory and copy configuration there. The root source folder also runs directly for development.

## 5. Deploy admin-create-user

This step enables the **Users & access → Create login** button. It requires the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started); an administrator or developer can run these commands from the project folder:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REFERENCE
supabase secrets set ALLOWED_ORIGIN=https://YOUR_SITE.netlify.app
supabase functions deploy admin-create-user
```

Use the exact HTTPS origin, with no trailing slash. A custom domain needs its own matching ALLOWED_ORIGIN value. Wildcards are deliberately rejected.

Supabase normally provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` inside Edge Functions. If needed, configure the public key as `SUPABASE_PUBLISHABLE_KEY` in the function secrets. The service key stays inside Supabase.

JWT gateway checking is disabled in `config.toml` because the function validates the bearer token with `auth.getUser()` itself and checks the caller's active admin role. It also checks the origin, method, request size, required fields, allowed roles and a unique request ID.

Screen description: Supabase → Edge Functions should list `admin-create-user`. Its secret configuration must contain ALLOWED_ORIGIN. Test it from the signed-in website, not by visiting its URL in a browser.

## 6. Import your connected workbook

1. Sign in as owner. Open **Import & export**.
2. Pick `Blesscon_Candy_Connected_Workbook.xlsx`.
3. Read the Import Report: section counts, new/changed/unchanged rows, errors and warnings.
4. Correct blocking errors in Excel and upload again. No rows are saved when validation fails.
5. Click **Import all pages**. The batch commits in one database transaction.
6. Review Products, Stock, Orders, Invoices, Expenses and Salesmen. No per-page Save is needed.
7. Upload the same file again to confirm stable business keys and no duplicate invoices/payments.

Opening stock defaults to a pre-history date (2000-01-01) if Products has no opening-stock date. An import can record historical negative stock, with an explicit warning, so the owner can reconcile missing opening stock. Live sales remain blocked by the default negative-stock setting.

Important: missing identifiers are not guessed. Unsupported formulas without cached values produce a warning or blocking error. Recalculate and save the workbook in Excel when requested. Template formula rows with no business inputs are skipped.

## 7. Migrate old JSON-blob data, if it exists

1. Export a backup of the old app and database before migration.
2. Run `supabase/migration_from_blob.sql` after the schema and first-admin setup.
3. Inspect its results. **Every row in `private.migration_errors` needs review before migration is considered complete.** The script retains the old `business_sections` payloads and records migrated keys.
4. Re-running unchanged records does not duplicate them.

The supplied earlier frontend used browser localStorage and never synchronised it to business_sections. The SQL cannot reach data stored only in a different browser. Export that old browser data and have it staged into the legacy table by an administrator before running the migration. Do not delete the original browser data until balances reconcile.

The migration supports object arrays, `{rows, headers}` grids and common per-section envelopes. It preserves historical selling rates and reconciles the old frontend's `products.stock` as a **current-stock snapshot**, not an opening balance. Unsupported or inconsistent records are logged rather than silently discarded. Cash is used for legacy received balances when no payment method was recorded.

## 8. Before daily use

- In Settings, fill your address, NTN (if applicable), bank/JazzCash details and approved signatory. The contact number is **+92 341 3905030**.
- Review the four wholesale tiers and product overrides. Current default Rani rates are 230 / 230 / 225 / 220; retail is 250 where supplied by the workbook.
- Create salesmen, set joining dates, targets and personal off dates, then create/link their logins.
- Give payment collection permission only to the users who should collect money.
- Run the live deployment checklist in `TESTING.md` using separate admin and salesman accounts.
- Test one real phone at 375 px or similar width and create one test invoice. Check stock and payment totals before entering real transactions.

## Offline behaviour

The app caches its own assets after a successful HTTPS load. Previously signed-in users can continue with cached data; writes go into a per-project, per-account queue. The badge shows Offline/pending or Synced. Reconnection retries the same operation IDs. The server rechecks ownership, prices, stock and record versions. A conflict remains visible for review and never silently overwrites another user's changes.

Final PDF/share, public links, bulk import, account changes and receipt-image upload require a connection. Pending documents can be viewed/printed only as provisional. Do not clear browser storage while changes are pending. Practice mode is explicitly separate and never synchronises with the business database.

## Backups, updates and sharing

- Download Excel and JSON backups from Import & export. JSON includes only rows visible to the current account.
- Public document links are random, read-only, expire after 30 days, and can be revoked or rotated. Anyone with the link can read that document; internal costs and override reasons are omitted.
- WhatsApp/mailto cannot attach files automatically. Use Share PDF on supported phones, or download and attach the PDF yourself.
- Apply source updates to the same Supabase project. Run `schema.sql` again only for this version's idempotent definitions. Keep a database backup before future migrations.
- The app performs target recalculation on login/sync and relevant changes, including past-order edits. It does not require a separate cron job. If nobody opens the app, stored targets refresh at the next sync.

## Developer checks

Requires Node.js 22+ for the included development tools. Application hosting itself needs only static files.

```sh
npm ci
npm test
npm run check
npm run release
```

Tests use PostgreSQL through PGlite, Vitest and jsdom. They do not substitute for a live Supabase, mobile-browser, Storage or Lighthouse test. See the exact result matrix in `TESTING.md`.

Primary references used: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [SheetJS cell objects](https://docs.sheetjs.com/docs/csf/cell/) and [SheetJS parsing options](https://docs.sheetjs.com/docs/api/parse-options/).


## Troubleshooting

- If `business_snapshot` is missing from the schema cache, run `supabase/schema.sql` in the project's SQL Editor, then run `notify pgrst, 'reload schema';` and hard-refresh the site.
- Run `supabase/verify.sql` in the SQL Editor to list required tables/functions and existing policies and identify missing schema objects.
- Confirm `app_config.js` uses the same Supabase project where the SQL was executed. Then run `supabase/first_admin.sql` to configure the first administrator.
