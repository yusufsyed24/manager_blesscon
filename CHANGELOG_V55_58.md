# Blesscon Candy Business Manager v55.58

## Admin manager profile access
- Added a **Profile** button beside manager account actions in Admin → Users & Access.
- The manager profile view displays the manager's account identity/status and profile photo, saved salary/target settings, attendance history, uploaded private documents, and fieldwork/customer visits where available.
- Manager profile viewing is Admin-only; manager user creation restrictions remain unchanged.

## Validation
- `node --check js/app.js` passed.
- ZIP integrity checked after packaging.
- Live Supabase behavior was not tested in this environment; table permissions and existing manager-profile migrations still apply.
