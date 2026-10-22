import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(resolve(root, 'web/js/app.js'), 'utf8');
const store = readFileSync(resolve(root, 'web/js/store.js'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/fix_salesman_manager_assignment_v55_7.sql'), 'utf8');

describe('v55.7 salesman-manager assignment repair', () => {
  it('keeps all salesman profiles visible to Admin and assigned profiles eligible for manager team views', () => {
    expect(app).toContain('return admin() || !salesman.user_id || linkedRole === "salesman" || !!salesman.manager_user_id;');
    expect(app).toContain('managerTeamIds(s, user.id)');
  });
  it('commits salesman assignments directly online and verifies the manager id returned by Supabase', () => {
    expect(store).toContain('kind === "master.save" && data?.table === "salesmen" && this.client && navigator.onLine');
    expect(store).toContain('const savedManager = saved.manager_user_id || null;');
    expect(store).toContain('Supabase saved the salesman profile but did not persist the selected Manager');
  });
  it('retains Admin read access and grants assigned Manager read access without deleting records', () => {
    expect(migration).toContain('public.is_admin()');
    expect(migration).toContain('manager_user_id = auth.uid()');
    expect(migration).toContain("ur.role = 'manager'");
    expect(migration).not.toMatch(/delete\s+from\s+public\.salesmen/i);
  });
});
