# Cash & Bank recovery and transfer clarification — v48

## Changes
- Clarified the Cash & Bank Book table heading so Market Credit recoveries are not presented as ordinary cash/bank payments.
- Added explicit in-app explanation: a recovery decreases Market Credit and increases only the receiving account; an account transfer decreases the source and increases the destination equally, leaving total liquid funds unchanged.
- Existing store and SQL transfer guards reject transfers exceeding the source account's calculated balance. If a historical transfer already posted an invalid negative balance, this UI patch does not silently rewrite the ledger; review and reverse/re-enter that transfer through an audited correction after verifying the bank statements.

## Important deployment note
This is an application display/logic clarification, not a repair of historical Supabase ledger rows. After upload, inspect the affected date's Cash & Bank Book entries and compare the source/destination amounts with bank statements. Do not delete ledger rows directly.
