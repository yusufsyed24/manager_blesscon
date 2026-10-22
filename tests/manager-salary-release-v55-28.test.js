import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";

const source = await fs.readFile("js/app.js", "utf8");
const migration = await fs.readFile("supabase/manager_salary_release_v55_28.sql", "utf8");

describe("v55.28 manager salary release", () => {
  it("provides manager payroll action and form with outstanding advance deduction", () => {
    expect(source).toContain('"post-manager-salary"');
    expect(source).toContain('id="manager-salary-post-form"');
    expect(source).toContain('.eq("manager_user_id", managerId)');
    expect(source).toContain("Advance deduction:");
    expect(source).toContain('manager_user_id:managerId,salary_period:month');
  });

  it("adds a manager salary period uniqueness guard and extends save_master allowlist", () => {
    expect(migration).toContain("expenses_manager_salary_period_unique");
    expect(migration).toContain("private.save_master(text,jsonb,integer)");
    expect(migration).toContain("manager_user_id");
  });
});
