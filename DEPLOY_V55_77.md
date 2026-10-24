# Deploy BCBM v55.77

1. Back up the current static deployment and Supabase database.
2. Extract this ZIP and upload the application folder through your normal Cloudflare static upload workflow.
3. In Supabase SQL Editor, review and run `supabase/arsalan_october_attendance_correction_v55_77.sql`. It adds 17 Oct 2026 as present only if there is no existing row for that date; existing rows are not overwritten. It stops if Arsalan's account cannot be uniquely identified.
4. Review both verification query results. Open Admin payroll, manager/employee payroll views and the salary slip; confirm the same credited attendance and gross/net amounts appear everywhere.
5. Do not release salary if views disagree or if the attendance total is not 17.

Static package only. This build has not been tested against the live Supabase database.
