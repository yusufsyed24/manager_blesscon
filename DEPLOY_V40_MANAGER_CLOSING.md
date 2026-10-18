# Blesscon Candy Manager v40 — Deployment guide

v40 adds: **Manager team closing**, **Manager expenses**, **Admin approval of manager closings**,
and re-ships the **v39 fix** (managers can close for any active salesman) in the folder Netlify actually publishes.

> **Why v39 seemed not to work:** `netlify.toml` publishes the **repository root (`.`)**, not `web/`.
> The v39 app fix had only been applied to `web/js/store.js`, so the deployed `js/store.js` kept the old
> rule. In v40 the root and `web/` copies are identical (`node scripts/release.mjs` keeps them in sync).
> Deploy the **whole folder**, not just `web/`.

## 1. Before you start
1. Take a Supabase backup (Project → Database → Backups) or export the tables you can.
2. Confirm the manager login exists with role `manager` (Users & access) and note Babar's user id
   (the existing migrations use `d2cf42d4-3806-44f1-9deb-369920e2f152`).
3. Confirm the team. The consolidated closing covers salesmen whose `manager_user_id` is Babar's id:
   ```sql
   select id, name, active, manager_user_id from public.salesmen order by name;
   -- assign any missing team members (replace ids):
   -- update public.salesmen set manager_user_id = 'd2cf42d4-3806-44f1-9deb-369920e2f152'::uuid where id in ('SP-…','SP-…');
   ```

## 2. Database (Supabase → SQL editor), in this order
Already-applied files can be skipped; every file is safe to re-run.
1. `supabase/manager_closing_fix_v39.sql` (only if not yet applied — verify with the query in step 3).
2. `supabase/manager_closing_expenses_v40.sql` — **new**. Look for these notices at the end:
   `save_master patched`, `business_snapshot patched` (or `already patched` on a re-run).
   If it stops with `… not found; nothing changed`, copy the message to the developer: the script refuses to
   guess and changes nothing in that case (the earlier statements in the same run are not rolled back,
   but they are idempotent, so simply re-run after the fix).

## 3. Verify the database
```sql
select to_regclass('public.manager_daily_closings') is not null                      as closing_table,
       to_regprocedure('public.manager_closing_command(uuid,text,jsonb)') is not null as closing_command,
       position('manager_expense_rules' in pg_get_functiondef('private.save_master(text,jsonb,integer)'::regprocedure)) > 0 as expenses_rules,
       position('manager_daily_closings' in pg_get_functiondef('public.business_snapshot()'::regprocedure)) > 0            as snapshot,
       position('a manager, or Admin' in pg_get_functiondef('public.apply_operational_command(uuid,text,jsonb)'::regprocedure)) > 0 as v39;
```
All five columns must be `true`.

## 4. Deploy the app
1. Upload the **entire v40 folder** to your host (Netlify publish directory is `.`).
2. Hard-refresh. If an installed/PWA copy shows old behaviour: DevTools → Application → Service Workers →
   Unregister, then Clear site data (or remove and re-add the installed app). The new cache name is
   `blesscon-static-v40-manager-closing-20261018`.
3. Check `https://YOUR-SITE/js/store.js` contains `closing.manager_submit`.

## 5. Acceptance test (≈10 minutes)
| As | Do | Expect |
|---|---|---|
| Manager (Babar) | Daily closing → **Submit team closing** | Summary shows team sales, collections by method, expenses, stock movements; submit succeeds; row appears under *Manager team closings* as **submitted** |
| Manager | Submit the same date again | "already submitted or changed" |
| Manager | Expenses → **+ Expense** (no salesman, and one linked to an assigned salesman) | Both saved; list shows only his own and his team's entries; Edit shown only on his own; no Delete |
| Manager | Try an expense linked to a salesman outside his team (use browser tools / API) | Rejected: "linked to your assigned salesmen" |
| Admin | Daily closing → *Manager team closings* | Submitted closing visible with **Approve** / **Reject** |
| Admin | Reject (reason required) | Status *rejected*, reason + time shown; Babar can resubmit |
| Admin | Approve | Status *approved*; decision, approver and time stored |
| Manager | Try to change a covered transaction (e.g. a team expense) on an approved day | Blocked until Admin reopens |
| Manager | Open salesman closing for a salesman not assigned to him (v39) | Allowed |

## 6. Behaviour you should know
- **Scope of the team closing:** confirmed orders and payments of the assigned active salesmen, plus Babar's own
  direct sales; expenses linked to the team plus Babar's own unlinked expenses (salary postings are excluded);
  salesman stock movements of the team. No salesman record is created.
- **Expected cash** = opening cash + cash collected − cash expenses − cash handed over. Opening cash must equal
  the previous *approved* manager closing. A reason is mandatory for any cash or stock variance.
- **Salesman closings are separate.** If each salesman also submits an individual closing, the manager closing
  re-counts the same team cash at manager level; do not add the two together.
- **Locking:** a submitted/approved manager closing locks the covered day's orders, payments and expenses until
  Admin rejects or reopens it.
- **Permissions:** only a manager can submit; only Admin can approve, reject or reopen; managers see only their
  own closings. Expense deletion stays Admin-only. Receipts upload to the manager's own folder.

## 7. Rollback
The migration only adds objects, so the old app keeps working. To disable the feature, redeploy the previous app
folder. Optional cleanup (loses manager closing history):
`drop function public.manager_closing_command(uuid,text,jsonb); drop table public.manager_daily_closings;`
Policy/function patches from steps 2–3 are harmless to leave in place.
