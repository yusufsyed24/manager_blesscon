import { describe, it, expect } from "vitest";
import fs from "node:fs";
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const store = fs.readFileSync(new URL("../js/store.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/revamp_v54.sql", import.meta.url), "utf8");

describe("v54 connected Admin → Manager → Salesman workflow", () => {
  it("provides a manager-specific operational dashboard without default financial totals", () => {
    const start = app.indexOf("function renderManagerDashboard()");
    const end = app.indexOf("function renderAdminMyProfile()", start);
    const view = app.slice(start, end);
    expect(view).toContain("Team monthly target");
    expect(view).toContain("Attendance missing");
    expect(view).toContain("Stock issued today");
    expect(view).not.toContain("cashbook");
    expect(view).not.toContain("profitLoss");
  });
  it("supports manager assignment, attendance, area assignment and persistent notifications", () => {
    expect(app).toContain('"Assigned manager"');
    expect(app).toContain('from("sales_areas")');
    expect(app).toContain('"Manage areas"');
    expect(app).toContain('"attendance-manager-form"');
    expect(app).toContain('"area-assignment-form"');
    expect(app).toContain('"notification-form"');
    expect(app).toContain('from("employee_notifications")');
    expect(app).toContain('rpc("assign_salesman_area"');
    expect(app).toContain('"Monthly target details"');
    expect(app).toContain('"Estimated monthly salary"');
  });
  it("does not let managers edit salary or login linkage through the staff form", () => {
    const start = app.indexOf('if (kind === "staff") {');
    const end = app.indexOf('if (kind === "customer")', start);
    const form = app.slice(start, end);
    expect(form).toContain('admin() ? field("Base salary');
    expect(form).toContain('admin() ? select("Link login account"');
    expect(store).toContain('user?.role === "manager" && table === "salesmen"');
  });
  it("enforces manager scope in trusted database functions and keeps employee files private", () => {
    expect(migration).toContain("create or replace function public.assign_salesman_area");
    expect(migration).toContain("create or replace function public.set_salesman_photo");
    expect(migration).toContain("create or replace function public.own_salary_snapshot");
    expect(migration).toContain("create or replace function public.can_document");
    expect(migration).toContain("cashbook_accounts_read");
    expect(migration).toContain("Only Admin can add money or adjust a cashbook balance");
    expect(migration).toContain("Stock issue permission required for this assigned team");
    expect(migration).toContain("Cannot use a salesman outside your assigned team");
    expect(migration).toContain("Payment permission required for this assigned team");
    expect(migration).toContain("create or replace function public.own_salary_snapshot");
    expect(migration).toContain("create or replace function public.can_document");
    expect(migration).toContain("cashbook_accounts_read");
    expect(migration).toContain("Only Admin can add money or adjust a cashbook balance");
    expect(migration).toContain("Only Admin or the assigned Manager may update this profile photo");
    expect(migration).toContain("employee-private");
    expect(migration).toContain("create trigger audit_change after insert or update or delete");
    expect(migration.toLowerCase()).not.toMatch(/\btruncate\b|\bdrop table\b|delete from public\.(products|orders|stock_movements)/);
  });
});
