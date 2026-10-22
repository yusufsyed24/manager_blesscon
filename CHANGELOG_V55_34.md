# v55.34 — Salesman login linking repair

- Create Login now lists existing salesman profiles that are unlinked or have an orphaned `user_id` pointing to no profile/login in the loaded user directory.
- When a selected salesman profile is linked to a newly created login, the save now checks `user_id` as well as manager assignment, so the link is persisted even if the manager assignment already matches.
- Profiles linked to an existing user remain excluded from the Create Login dropdown to avoid unintentionally assigning one profile to multiple active logins.

## Validation
- JavaScript syntax checked with `node --check`.
- No live Supabase account or database was changed by packaging this build. Deploy the build and test with Admin → Users & Access → Create Login.
