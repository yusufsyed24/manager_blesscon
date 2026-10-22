import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(resolve(root, 'web/js/app.js'), 'utf8');
const deleteFn = readFileSync(resolve(root, 'supabase/functions/admin-delete-user/index.ts'), 'utf8');
const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');

describe('v55.5 manager assignment and user deletion', () => {
  it('shows manager assignment in Users & Access and supports assigning salesman to manager', () => {
    expect(app).toContain('"Assigned manager"');
    expect(app).toContain('manager_user_id: f.manager_user_id || null');
    expect(app).toContain('managerProfile?.display_name');
  });
  it('offers a delete-user action but protects the current user in the UI', () => {
    expect(app).toContain('btn("Delete user", "delete-user"');
    expect(app).toContain('You cannot delete your own signed-in account.');
    expect(app).toContain('admin-delete-user');
  });
  it('validates Admin, blocks self-deletion and last active Admin deletion server-side', () => {
    expect(deleteFn).toContain('caller.rpc("is_admin")');
    expect(deleteFn).toContain('targetId === authData.user.id');
    expect(deleteFn).toContain('Cannot delete the last active Admin account');
    expect(deleteFn).toContain('service.auth.admin.deleteUser(targetId)');
  });
  it('configures the function without gateway JWT enforcement because the function validates caller auth itself', () => {
    expect(config).toContain('[functions.admin-delete-user]');
    expect(config).toContain('verify_jwt = false');
  });
});
