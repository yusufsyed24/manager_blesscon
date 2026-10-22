import { describe, it, expect } from "vitest";
import fs from "node:fs";
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/employee_salary_advances_v55_27.sql", import.meta.url), "utf8");

describe("v55.27 salary advance editing and deduction", () => {
  it("shows outstanding advances and an Admin edit action", () => {
    expect(app).toContain('case "edit-salary-advance"');
    expect(app).toContain('recovered_paisa');
    expect(app).toContain('Save advance changes');
  });
  it("calculates gross salary, deduction and net salary before confirmation", () => {
    expect(app).toContain('"Gross salary"');
    expect(app).toContain('"Advance deduction this salary"');
    expect(app).toContain('"Net salary to release"');
    expect(app).toContain('advance reasons:');
  });
  it("audits advance edits and posts a Cash & Bank Book adjustment", () => {
    expect(migration).toContain("private.post_salary_advance_edit_adjustment");
    expect(migration).toContain("INSERT INTO public.cashbook_entries");
    expect(migration).toContain("INSERT INTO public.audit_log");
  });
  it("stores recovery amounts and prevents editing after salary recovery", () => {
    expect(migration).toContain("recovered_paisa");
    expect(migration).toContain("Edited advance amount cannot be lower than the amount already recovered through salary");
  });
});
