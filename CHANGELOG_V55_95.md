# BCBM v55.95 — Advance salary safeguards + reversal script
- Releasing an advance now refuses an identical advance (same employee, amount, account) already released in the last 24 hours, and blocks double-submit while saving.
- New supabase/reverse_salary_advance_v55_95.sql: audit-safe reversal (credits the bank back via a cash-book reversal entry and marks the advance 'reversed').
