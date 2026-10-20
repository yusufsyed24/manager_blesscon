import { describe, it, expect } from "vitest";
import fs from "node:fs";
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/salesman_profile_only_salary_v55_14.sql", import.meta.url), "utf8");

describe("v55.14 salesman profile-only access and sales-based salary", () => {
  it("exposes only My profile to salesman accounts and overrides saved routes", () => {
    expect(app).toContain('const SALESMAN_PAGES = ["myprofile"]');
    expect(app).toContain('if (user?.role === "salesman") page = "myprofile"');
    expect(app).toContain('user?.role !== "salesman" && [0, 5, 10].includes(i)');
  });
  it("includes the required profile data and daily stock/sales breakdown", () => {
    expect(app).toContain('id="profile-avatar"');
    expect(app).toContain('Date of birth: <b>');
    expect(app).toContain('id="my-current-area"');
    expect(app).toContain('Stock assigned that day');
    expect(app).toContain('Sold that day');
    expect(app).toContain('id="my-document-history"');
    expect(app).toContain('id="my-salary-panel"');
    expect(app).toContain('Monthly target progress');
  });
  it("calculates salary achievement from confirmed order boxes and preserves posted salary", () => {
    expect(migration).toContain("o.status='confirmed'");
    expect(migration).toContain("sum(i.boxes::numeric / nullif(i.boxes_per_carton,0))");
    expect(migration).toContain("'achieved_boxes',achieved_boxes");
    expect(migration).toContain("case when posted is null then incentive else greatest(0,posted-seller.base_salary_paisa) end");
    expect(migration.toLowerCase()).not.toMatch(/\btruncate\b|\bdrop table\b|delete from public\./);
  });
});
