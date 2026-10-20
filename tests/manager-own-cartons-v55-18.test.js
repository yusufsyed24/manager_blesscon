import { describe, it, expect } from "vitest";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

describe("v55.18 manager own carton sales", () => {
  it("counts only this manager's confirmed, non-deleted direct orders for the current month", () => {
    expect(app).toContain('const managerOrders = s.orders.filter(o => o.status === "confirmed" && !o.deleted_at && !o.salesman_id && o.created_by === user.id && o.date >= from && o.date <= to)');
  });
  it("converts the manager's direct order quantities to cartons and adds them to team achievement", () => {
    expect(app).toContain("const managerCartons = cartons(managerOrders)");
    expect(app).toContain("const combinedAchieved = achievedCartons + managerCartons");
    expect(app).toContain('card("Your additional cartons sold", `+${managerCartons.toFixed(2)} cartons`');
    expect(app).toContain('card("Total achieved incl. your sales", `${combinedAchieved.toFixed(2)} cartons`');
    expect(app).toContain('teamTarget-combinedAchieved');
  });
});
