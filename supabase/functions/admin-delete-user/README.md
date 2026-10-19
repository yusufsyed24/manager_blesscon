# Admin delete-user Edge Function

Deploy with:

```bash
supabase functions deploy admin-delete-user --no-verify-jwt
```

The function validates the caller JWT and `is_admin()` before using the server-side service-role key. Set `ALLOWED_ORIGIN` to the exact GitHub Pages origin (`https://yusufsyed24.github.io`). It refuses self-deletion and deletion of the last active Admin. A linked salesman employee record is retained and detached from the login; auth/profile/role/permission rows are deleted through Supabase Auth foreign-key cascades. Review your schema's `ON DELETE` rules for user-specific manager fieldwork before deleting a manager.
