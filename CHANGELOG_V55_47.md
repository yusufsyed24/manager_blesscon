# v55.47 — Admin salary calculation display fix

- Fixed Admin → Salary & Payroll calculations so rendering no longer relies on the legacy slab calculator for the new per-carton payroll settings.
- Added a per-employee “View calculation” action with the same detailed monthly components shown in the employee salary breakdown: paid attendance including Week Off, attendance factor, base salary, allowance, confirmed cartons, monthly target, achievement, above-target incentive, gross salary, advances/recoveries, estimated net, and release status.
- Uses the selected month for attendance, confirmed orders, and salary period; manager direct cartons remain separate from team targets.
- Salary release for salesmen now uses the same month-specific payroll calculation shown on the Admin page; manager release opens with the calculated gross amount prefilled.
- Preserves the existing rule that a released employee/month does not show the release action.

Validation: JavaScript syntax checks and ZIP integrity checks passed. Live Supabase permissions and calculations have not been tested against the production database.
