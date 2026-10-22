# v55.40 — Admin manager payroll settings and attendance salary fix

- Added Admin UI in Users & Access → Managers & company target to configure and save each manager’s monthly base salary, allowance, incentive per carton above individual target, monthly carton target, and working days.
- Manager settings are saved to `public.manager_payroll_settings`, used by the existing manager salary snapshot.
- Salesman dashboard salary summary now explicitly shows attendance credited and attendance-adjusted base salary earned.
- Uses the v55.38 payroll migration; no live Supabase database was available for execution or verification.
