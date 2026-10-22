# v55.35 — Admin salesman profile linking

- Fixed Create Login to load the authoritative salesman profile list directly from Supabase for Admin, instead of relying only on `business_snapshot` data.
- Existing active profiles without a linked user should now appear in Link salesman. Profiles with an orphaned user link are still offered for repair; profiles already linked to an existing login are excluded to avoid duplicate links.
- If Supabase denies reading salesman profiles, the dialog now reports the specific load error rather than silently showing only the create-new option.
- This is a frontend change. No database migration was applied and no live records were changed.
