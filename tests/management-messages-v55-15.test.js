import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const app = readFileSync(resolve(root, "js/app.js"), "utf8");
const sql = readFileSync(resolve(root, "supabase/management_messages_manager_cashbook_v55_15.sql"), "utf8");
describe("v55.15 management messaging and manager module restrictions", () => {
  it("adds Admin announcement audiences and manager inbox actions", () => {
    expect(app).toContain("__all_managers__");
    expect(app).toContain("recipient_user_id: id");
    expect(app).toContain("hydrateManagerNotifications");
    expect(app).toContain("Messages from Admin &amp; Manager");
    expect(app).toContain('if (user.role === "salesman") hydrateSalesmanNotifications()');
    expect(app).toContain("ack-manager-notification");
  });
  it("fans Admin messages out to the selected Manager's assigned salesmen", () => {
    expect(app).toContain("addManagerAndTeam(id)");
    expect(app).toContain("also notify assigned Manager");
    expect(sql).toContain("recipient_user_id = auth.uid() and public.is_manager()");
    expect(sql).toContain("sm.manager_user_id = auth.uid()");
  });
  it("hides Cash & Bank Book from Managers regardless of old module permissions", () => {
    expect(app).toContain('(manager() && p === "cashbook") ? false : canBase(p)');
  });
});
