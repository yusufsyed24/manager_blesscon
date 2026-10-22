import { describe, it, expect } from "vitest";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/revamp_v53.sql", import.meta.url), "utf8");

describe("v53 salesman profile safeguards", () => {
  it("renders the salesman profile as manager-controlled and read-only", () => {
    const start = app.indexOf("function renderMyProfile() {");
    const end = app.indexOf("function targetRows()", start);
    const view = app.slice(start, end);
    expect(view).toContain("managed by your manager");
    expect(view).toContain("Attendance history");
    expect(view).not.toContain('data-act="profile-photo-upload"');
    expect(view).not.toContain('data-act="employee-document-upload"');
    expect(view).not.toContain('btn("Check in"');
  });

  it("does not show monetary cards on the salesman overview", () => {
    const start = app.indexOf("function renderSalesmanDashboard() {");
    const end = app.indexOf("function hydrateTeamNotifications()", start);
    const view = app.slice(start, end);
    expect(view).toContain("Quantity sold today");
    expect(view).toContain("Date of birth");
    expect(view).not.toContain("Today’s collection");
    expect(view).not.toContain("ownOutstanding");
    expect(view).not.toContain("money(");
  });

  it("requires explicit permission for manager financial modules and hides them from salesmen", () => {
    const start = app.indexOf("const can = (p) =>");
    const end = app.indexOf("const badge =", start);
    const rules = app.slice(start, end);
    expect(rules).toContain('["dashboard","myprofile","orders","stock"]');
    expect(rules).not.toContain('["dashboard","myprofile","dsr","closing","cashbook","orders"');
    expect(rules).toContain("financial, pricing and system-wide");
  });

  it("adds the DOB, area assignment and notification schema without destructive reset", () => {
    expect(migration).toContain("add column if not exists date_of_birth date");
    expect(migration).toContain("create table if not exists public.salesman_area_assignments");
    expect(migration).toContain("create table if not exists public.employee_notifications");
    expect(migration.toLowerCase()).not.toMatch(/\btruncate\b|\bdrop table\b|delete from public\.(products|orders|stock_movements)/);
  });

  it("removes legacy salesman attendance and employee document write policies", () => {
    expect(migration).toContain("drop policy if exists attendance_self_insert");
    expect(migration).toContain("drop policy if exists attendance_self_update");
    expect(migration).toContain("drop policy if exists employee_documents_self_insert");
    expect(migration).toContain("revoke update (photo_path) on public.salesmen from authenticated");
  });
});
