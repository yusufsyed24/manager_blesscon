# Blesscon Candy Business Manager v55.59

## Admin employee edit workflow
- Added an employee-details section to Admin → Users & Access → Edit.
- Linked salesman accounts now have a direct action to open the existing employee edit form, including employee ID and the employment/payroll fields supported by that form.
- Manager accounts have a direct action to edit manager salary parameters and individual target.
- Existing user access and role saving remains separate from employee and compensation edits, reducing the risk of creating duplicate accounts.

## Validation and limitations
- JavaScript syntax check passed.
- ZIP integrity check passed after packaging.
- Live Supabase permissions/data were not available for end-to-end testing.
