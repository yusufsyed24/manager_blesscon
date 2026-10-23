# v55.57 — Unified user and employee profile creation

- Removed the standalone “Create salesman” button from Admin and Manager team views.
- Blocked manager-side new salesman creation in the UI and save handler.
- Restricted Users & Access and the user-creation flow to Admin.
- Replaced the user-creation form with one Admin workflow that selects Salesman or Manager.
- Salesman creation now collects employee ID, phone, DOB, joining date, base salary, allowance, incentive, working-day basis, target, active status, assigned manager, off-days, salary basis, optional profile photo and optional NIC/identity document.
- Selecting Salesman creates and links the salesman record, compensation settings, optional commission rates and optional uploaded photo/NIC.
- Selecting Manager creates the login/profile with the manager role and creates manager payroll settings.
- Corrected the bundled `admin-create-user` Edge Function, which previously contained deletion logic rather than user-creation logic; server-side checks now allow only active Admin callers and only the Salesman/Manager roles.
- Bumped service-worker cache and package version to 55.57.

## Validation
- `node --check js/app.js` passed.
- ZIP integrity and the Edge Function source were inspected.
- Live Supabase execution was not available in this build session; deploy the updated Edge Function before testing user creation.
