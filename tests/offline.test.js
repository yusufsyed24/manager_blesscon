// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { Store, empty } from "../js/store.js";
it("offline writes are queued per account, survive reload, and retry with the SAME operation ID", async () => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  const rpc = vi.fn(),
    client = {
      supabaseUrl: "https://example.supabase.co",
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: "owner1" } } },
        }),
      },
      rpc,
    };
  let user = { id: "owner1", role: "admin" };
  const s = new Store(client, user);
  await s.run("master.save", {
    table: "customers",
    record: { id: "C", name: "Customer" },
  });
  expect(s.queue).toHaveLength(1);
  const op = s.queue[0].id;
  const restored = new Store(client, user);
  expect(restored.state.customers[0].name).toBe("Customer");
  expect(new Store(client, { id: "owner2", role: "admin" }).queue).toHaveLength(
    0,
  );
  restored.refresh = async () => {};
  rpc.mockImplementation(async (name) =>
    name === "apply_command"
      ? { data: { id: "C" }, error: { message: "Network unavailable" } }
      : { data: 0 },
  );
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  await restored.sync();
  expect(restored.queue[0].id).toBe(op);
  rpc.mockResolvedValue({ data: { id: "C" }, error: null });
  await restored.sync();
  expect(restored.queue).toHaveLength(0);
  expect(
    rpc.mock.calls
      .filter((x) => x[0] === "apply_command")
      .every((x) => x[1].op_id === op),
  ).toBe(true);
});
it("server conflicts remain visible and queued instead of silently overwriting", async () => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  const client = {
    supabaseUrl: "https://conflict.supabase.co",
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "admin" } } },
      }),
    },
    rpc: async () => ({ error: { message: "CONFLICT: Record changed" } }),
  };
  const s = new Store(client, { id: "admin", role: "admin" });
  expect(
    (
      await s.run("master.save", {
        table: "customers",
        record: { id: "C", name: "Shop" },
      })
    ).queued,
  ).toBe(true);
  expect(s.queue).toHaveLength(1);
  expect(s.error).toContain("CONFLICT");
});

it("never sends one account’s pending writes using a different signed-in account", async () => {
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  const rpc = vi.fn();
  const c = {
    supabaseUrl: "https://switch.supabase.co",
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "second" } } },
      }),
    },
    rpc,
  };
  const s = new Store(c, { id: "first", role: "admin" });
  await s.run("master.save", {
    table: "customers",
    record: { id: "C", name: "First owner customer" },
  });
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  await s.sync();
  expect(rpc).not.toHaveBeenCalled();
  expect(s.queue).toHaveLength(1);
  expect(s.error).toContain("account that created");
});

it("product.save surfaces a rejected Supabase write and does not queue a false success", async () => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  const client = {
    supabaseUrl: "https://product-error.supabase.co",
    auth: { getSession: async () => ({ data: { session: { user: { id: "admin" } } } }) },
    rpc: vi.fn(async () => ({ data: null, error: { message: "Admin required", code: "P0001" } })),
  };
  const s = new Store(client, { id: "admin", role: "admin" });
  s.refresh = vi.fn();
  await expect(s.run("product.save", { record: { id: "BC-GEN-0001", name: "Candy", boxes_per_carton: 24, cost_paisa: 0, retail_paisa: 0, wholesale_paisa: 0 }, tiers: [] })).rejects.toThrow("Admin required");
  expect(s.queue).toHaveLength(0);
  expect(s.refresh).not.toHaveBeenCalled();
});

it("product.save remains successful if Supabase committed but snapshot refresh fails", async () => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  const committed = { product: { id: "P2", name: "Saved Candy", active: true, boxes_per_carton: 24, cost_paisa: 0, retail_paisa: 0, wholesale_paisa: 0, version: 1 }, tiers: [] };
  const client = {
    supabaseUrl: "https://product-refresh-error.supabase.co",
    auth: { getSession: async () => ({ data: { session: { user: { id: "admin" } } } }) },
    rpc: vi.fn(async () => ({ data: committed, error: null })),
  };
  const s = new Store(client, { id: "admin", role: "admin" });
  s.refresh = vi.fn(async () => { throw Error("business_snapshot unavailable"); });
  const result = await s.run("product.save", { record: committed.product, tiers: [] });
  expect(result.product.id).toBe("P2");
  expect(s.state.products).toContainEqual(expect.objectContaining({ id: "P2", name: "Saved Candy" }));
  expect(s.error).toContain("Product saved successfully");
  expect(s.queue).toHaveLength(0);
});

it("product.save refreshes authoritative data before returning success", async () => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  const client = {
    supabaseUrl: "https://product-success.supabase.co",
    auth: { getSession: async () => ({ data: { session: { user: { id: "admin" } } } }) },
    rpc: vi.fn(async () => ({ data: { product: { id: "P1", name: "Candy" }, tiers: [] }, error: null })),
  };
  const s = new Store(client, { id: "admin", role: "admin" });
  s.refresh = vi.fn(async () => {});
  const result = await s.run("product.save", { record: { id: "P1", name: "Candy", boxes_per_carton: 24, cost_paisa: 0, retail_paisa: 0, wholesale_paisa: 0 }, tiers: [] });
  expect(result.product.id).toBe("P1");
  expect(s.refresh).toHaveBeenCalledOnce();
  expect(s.queue).toHaveLength(0);
});
