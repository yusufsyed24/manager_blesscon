import { it, expect } from "vitest";
import {
  targetChain,
  DEFAULTS,
  salary,
  profitLoss,
  paymentState,
} from "../js/domain.js";
const s = {
  id: "S",
  joining_date: "2026-10-01",
  monthly_target: 130,
  base_salary_paisa: 4500000,
  off_days: [],
};
const cfg = { ...DEFAULTS, holidays: ["2026-10-31"] };
it("130 / 26 = 5, day1 achieves 3, day2 effective 7, day3 returns 5", () => {
  const os = [
    {
      id: "O1",
      salesman_id: "S",
      date: "2026-10-01",
      status: "confirmed",
      total_paisa: 1,
    },
    {
      id: "O2",
      salesman_id: "S",
      date: "2026-10-02",
      status: "confirmed",
      total_paisa: 1,
    },
  ];
  const ls = [
    { order_id: "O1", boxes: 72, boxes_per_carton: 24 },
    { order_id: "O2", boxes: 168, boxes_per_carton: 24 },
  ];
  const r = targetChain(s, os, ls, cfg, "2026-10-03");
  expect(r.map((x) => x.effective_target)).toEqual([5, 7, 5]);
  expect(r[0].carried_forward_out).toBe(2);
});
it("month boundary rolls or resets and optional surplus reduces next target", () => {
  let a = { ...s, joining_date: "2026-10-30" };
  const roll = targetChain(a, [], [], cfg, "2026-11-02");
  const reset = targetChain(
    a,
    [],
    [],
    { ...cfg, carry_month_end: false },
    "2026-11-02",
  );
  expect(roll.at(-1).carried_forward_in).toBe(5);
  expect(reset.at(-1).carried_forward_in).toBe(0);
  expect(salary(s, 130).total).toBe(5500000);
});
it("payment states and expense deletion change net exactly, cancelled orders excluded", () => {
  expect(paymentState(10000000, 0).status).toBe("UNPAID");
  expect(paymentState(10000000, 4000000)).toMatchObject({
    status: "PART PAID",
    balance: 6000000,
  });
  expect(paymentState(10000000, 10000000).status).toBe("PAID");
  const orders = [
      {
        id: "O",
        date: "2026-10-01",
        status: "confirmed",
        subtotal_paisa: 10000000,
        discount_paisa: 0,
        total_paisa: 10000000,
        channel: "retail",
      },
    ],
    items = [
      {
        order_id: "O",
        boxes: 400,
        cost_paisa: 20000,
        rate_paisa: 25000,
        amount_paisa: 10000000,
      },
    ];
  const expenses = [
    { date: "2026-10-01", amount_paisa: 2000000, category: "Rent" },
  ];
  const calc = (e, o = orders) =>
    profitLoss(o, items, e, [], [], "2026-10-01", "2026-10-31");
  expect(calc([]).net - calc(expenses).net).toBe(2000000);
  expect(calc([{ ...expenses[0], deleted_at: "now" }]).net).toBe(calc([]).net);
  expect(calc([], [{ ...orders[0], status: "cancelled" }]).revenue).toBe(0);
});
