# Deploy BCBM v55.76

1. Back up the current deployed folder and Supabase database before replacing files.
2. Extract `BCBM_v55_76_Commission_Salary_Release_Fix.zip`.
3. Upload the extracted application folder using the existing Cloudflare static-folder upload process.
4. No new SQL migration is included for this frontend preview fix.
5. In Admin, open a commission-basis salesman's salary release for a month with confirmed sales. Confirm that the preview lists product, cartons sold, commission rate, total commission, advance deduction, and net payment.
6. If commission remains zero, verify that the salesman has product commission rates saved against their linked login user and that their orders are `confirmed` with matching month dates and order items. Do not release a zero amount without checking these records.

Validation is limited to JavaScript syntax and ZIP integrity. Live Supabase/RLS and end-to-end salary posting have not been tested here.
