# Manager profile & fieldwork validation

## Checks run in this build environment
- `node --check js/app.js` — passed
- `node --check web/js/app.js` — passed after release sync
- `node scripts/release.mjs` — passed
- Automated Vitest suite — not run: `vitest` is not installed in this environment
- Supabase migration — not run against the live project; schema/RLS/storage integration remains unverified

## Required live smoke tests after applying migration
1. Sign in as BABAR ALI KHAN and open **My profile & fieldwork**.
2. Upload a JPG/PNG/WebP profile photo; refresh and confirm it remains visible.
3. Check in, check out, and repeat once with GPS denied to confirm GPS is optional.
4. Upload a PDF and a photo; confirm both appear in history and open with signed private links.
5. Save a customer visit with notes without GPS and another with GPS permission.
6. Confirm the Manager sees attendance only for salesmen assigned to their `manager_user_id`.
7. Sign in as Admin and confirm Manager profile photo, attendance, documents, visits and GPS links are visible.
8. Confirm an unrelated Manager cannot read this Manager's fieldwork or the other Manager's team attendance.
