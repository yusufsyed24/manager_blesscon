# v55.20 — Salary payment account and linked expense

- Manual salary release now opens a confirmation form with an explicit active Cash & Bank Book account selector, payment date, and optional reference.
- Successful release creates one salary expense tied to the employee and salary period, with a clear `Salary released to <name>` description and `cashbook_account_key` set to the selected account.
- Existing expense-to-cashbook posting trigger is expected to post the linked expense to the selected account. No separate second debit is created by the UI.
- Automatic salary posting uses an employee salary account preference if configured, otherwise an available cash account.
- Validation: `node --check js/app.js` passed. Automated Vitest suite could not run because the archive's `node_modules` does not contain the Vitest executable. Apply to a staging database and verify the cashbook expense trigger and RLS before production.
