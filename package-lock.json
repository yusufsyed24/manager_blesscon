# v55.36 — Existing salesman login linking fix

- Admin Create Login now lists all active, non-deleted existing salesman profiles, including records with a stale `user_id` reference. Already-linked records are labeled so Admin can verify before relinking.
- The link workflow fetches the selected salesman row directly when it is absent from the cached business snapshot, then persists the new authentication user ID.
- No database migration is included and no live Supabase data was changed.
- Validation: JavaScript syntax check and ZIP integrity check. Live Supabase permissions and account linking remain to be tested in the deployment.
