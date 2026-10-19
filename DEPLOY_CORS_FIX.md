# Deploy fix: admin-user-directory CORS preflight

This patch fixes the `OPTIONS` preflight flow for `admin-user-directory` while preserving JWT authentication and the `is_admin` permission check for `POST`. Origins are still restricted to an exact allowlist.

## 1. Set the Supabase secret

In Supabase Dashboard → Edge Functions → Secrets, set:

- Name: `ALLOWED_ORIGIN`
- Value: `https://yusufsyed24.github.io`

Do not add a path or trailing slash. Do not use `*`. If you use a custom domain too, you may instead set `ALLOWED_ORIGINS` to a comma-separated list of exact origins.

## 2. Deploy the function

Extract this project ZIP, open a terminal in the project root (the folder containing `supabase/`), and run:

```bash
supabase login
supabase link --project-ref ggfjddhqevcvosxberua
supabase functions deploy admin-user-directory --no-verify-jwt
```

`--no-verify-jwt` is required here because the function performs its own bearer-token validation and admin-role check. Do not remove those checks or expose the service-role key in the browser.

If your Supabase CLI version does not accept `--no-verify-jwt`, deploy normally and ensure `supabase/config.toml` has `verify_jwt = false` for this function.

## 3. Verify

1. Reload `https://yusufsyed24.github.io` with Ctrl+Shift+R.
2. Sign in as an Admin and open Users & Access.
3. In browser DevTools → Network, select `admin-user-directory`; the `OPTIONS` request should return `204`, then `POST` should return `200` for an authorized Admin.
4. If `OPTIONS` is still `403`, verify the secret is saved in the same Supabase project and exactly matches the site origin.

The fix changes the source package only; it does not deploy to Supabase automatically.
