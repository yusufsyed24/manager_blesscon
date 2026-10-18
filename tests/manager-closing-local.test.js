import { it, expect } from "vitest";
import { runRegression } from "../scripts/regress-manager-closing.mjs";

// Wraps the dependency-free regression script so `npm test` runs it with the rest of the suite.
it("manager closing, manager expenses and Admin approval regression checks pass", async () => {
  const results = await runRegression();
  expect(results.filter((r) => !r.ok)).toEqual([]);
  expect(results.length).toBeGreaterThanOrEqual(10);
});
