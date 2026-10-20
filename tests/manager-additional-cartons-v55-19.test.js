import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { targetPerformance } from "../js/domain.js";

describe("v55.19 manager additional carton sales", () => {
  it("keeps manager direct cartons outside team target achievement", () => {
    const orders = [
      { id: "S", salesman_id: "salesman-1", created_by: "salesman-user", date: "2026-10-15", status: "confirmed" },
      { id: "M", salesman_id: null, created_by: "manager-user", date: "2026-10-15", status: "confirmed" },
    ];
    const items = [
      { order_id: "S", boxes: 240, boxes_per_carton: 24 },
      { order_id: "M", boxes: 72, boxes_per_carton: 24 },
    ];
    expect(targetPerformance(orders, items, "2026-10-01", "2026-10-31", "manager-user")).toEqual({
      achieved_cartons: 10, manager_direct_cartons: 3, salesman_cartons: 10,
    });
  });
  it("labels manager sales as additional and excluded on Manager and Admin views", () => {
    const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
    expect(app).toContain("not counted toward team target");
    expect(app).toContain("Manager's own cartons are additional sales and are excluded from the team target calculation.");
    expect(app).toContain("Own sales (additional; excluded)");
    expect(app).toContain("Remaining team target");
  });
});
