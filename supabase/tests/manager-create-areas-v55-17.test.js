import { describe, it, expect } from "vitest";
import fs from "node:fs";
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/manager_create_sales_areas_v55_17.sql", import.meta.url), "utf8");

describe("v55.17 manager area creation", () => {
  it("shows Manage areas to Managers on overview and staff pages", () => {
    expect(app).toContain('((admin() || manager()) ? btn("Manage areas", "manage-areas") : "")');
    expect(app).toContain('(admin() || manager()) ? btn("+ Create salesman", "add-staff", "", "", "gold") + btn("Manage areas", "manage-areas") : ""');
  });
  it("allows Managers to create areas while keeping activation changes Admin-only", () => {
    expect(app).toContain('if (!(admin() || manager()) || !client) throw Error("Only an online Admin or Manager can manage area definitions.")');
    expect(app).toContain('if (!(admin() || manager()) || !client) throw Error("Only Admin or Manager can create areas.")');
    expect(app).toContain('if (!admin() || !client) throw Error("Only Admin can activate or deactivate areas.")');
    expect(migration).toContain("create policy sales_areas_manager_insert");
    expect(migration).toContain("public.is_manager() and created_by = auth.uid() and active = true");
  });
});
