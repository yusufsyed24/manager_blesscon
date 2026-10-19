# Blesscon Candy Business Manager v55.8 — Duplicate salesman repair

## What this fixes

- Prevents an existing Manager login from being changed into a Salesman login in Users & Access. This avoids creating a second salesman profile tied to the Manager account.
- Rejects assigning the Manager's own login as the salesman login for that same Manager.
- Includes a narrowly scoped repair for the two Yusuf rows supplied by the user. The repair verifies IDs, login linkage, shared Manager, matching name, and Manager role. It merges foreign-key references into the canonical profile and soft-deletes the duplicate. If a precondition or unique constraint fails, the SQL transaction rolls back.

## Deploy

1. Back up the database before changing historical links.
2. In Supabase SQL Editor, run `supabase/repair_duplicate_salesman_v55_8.sql`. Do not paste shell commands into SQL Editor.
3. If SQL reports any mismatch or constraint conflict, stop and send the full error; do not manually delete either profile.
4. Publish the updated `web/` files to GitHub Pages and synchronize root duplicates if your repository serves them. Commit and push, then hard-refresh the site.
5. In Users & Access, keep the Manager account role as `manager`. Link the actual salesman login (`f68c26e7-a6d9-400a-bdfc-2aaa51f5e59f`) to the canonical salesman profile. Assign that profile to Manager `d2cf42d4-3806-44f1-9deb-369920e2f152`.

## Safety notes

- The SQL is specific to the two IDs reported and refuses to act if the rows differ from the expected relationships.
- It reassigns foreign-key references to the canonical salesman so existing business history is retained. A uniqueness conflict aborts the entire transaction.
- The duplicate is soft-deleted, not physically removed.
- This patch has not been run against the live Supabase project. Validate the SQL output before relying on the result.
