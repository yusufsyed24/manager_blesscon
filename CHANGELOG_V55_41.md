# v55.41 — Make manager salary setup visible

- Added a prominent **Set up salary details** action directly under each manager name in Admin → Managers & company target.
- Kept salary release in the Payroll column, so setup does not require horizontal scrolling to the far-right column.
- Reuses the existing manager payroll settings form and save handler; does not alter salary calculation rules or database schema.
- Validation: JavaScript syntax and ZIP integrity checked. Live Supabase save/reload has not been tested.
