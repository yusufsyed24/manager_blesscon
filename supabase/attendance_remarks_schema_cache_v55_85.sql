-- BCBM v55.85: fix manager/admin attendance save error.
-- Adds the remarks field expected by the frontend and refreshes PostgREST's schema cache.
-- Safe to re-run; existing attendance rows and statuses are preserved.
BEGIN;
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS remarks text NOT NULL DEFAULT '';
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verify the column exists and the API schema cache reload was requested.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'attendance_records'
  AND column_name = 'remarks';
