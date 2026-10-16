import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Store } from "../js/store.js";
import { DEFAULTS } from "../js/domain.js";

const product = {
  id: "BC-GEN-0001", name: "Test Candy", category: "GEN",
  boxes_per_carton: 24, cost_paisa: 100, retail_paisa: 200,
  wholesale_paisa: 150, expiry_date: "2027-01-01", active: true,
  version: 1, deleted_at: null,
};

beforeEach(() => {
  vi.stubGlobal("localStorage", {
    values: new Map(),
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); },
  });
  vi.stubGlobal("window", { addEventListener() {} });
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

it("saves and refreshes a product when deployed apply_command lacks product.save", async () => {
  let first = true;
  const client = {
    supabaseUrl: "https://test.supabase.co",
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }) },
    rpc: async (_name, args) => {
      if (args.kind === "product.save" && first) {
        first = false;
        return { data: null, error: { message: "Unknown command" } };
      }
      if (args.kind === "master.save" && args.data.table === "products") return { data: product, error: null };
      if (args.kind === "business_snapshot") return { data: { settings: DEFAULTS, products: [product], price_tiers: [] }, error: null };
      throw new Error(`Unexpected RPC: ${args.kind}`);
    },
  };
  const store = new Store(client, { id: "u1", role: "admin", practice: false });
  const result = await store.run("product.save", { record: product, expected_version: null, tiers: [] });
  expect(result.product.id).toBe(product.id);
  expect(store.state.products.map(p => p.id)).toContain(product.id);
});
