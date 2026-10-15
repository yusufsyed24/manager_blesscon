import { it, expect } from "vitest";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
it("Edge handler rejects foreign origins and wildcard configuration before auth; validates input after admin check", async () => {
  const source = (
    await fs.readFile(
      new URL(
        "../supabase/functions/admin-create-user/index.ts",
        import.meta.url,
      ),
      "utf8",
    )
  ).replace(/^import .*\n/, "");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  let handler;
  const env = {
    ALLOWED_ORIGIN: "https://blesscon.test",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "public",
    SUPABASE_SERVICE_ROLE_KEY: "test",
  };
  const context = {
    Deno: { env: { get: (k) => env[k] }, serve: (fn) => (handler = fn) },
    Response,
    Request,
    createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: "admin" } }, error: null }),
      },
      rpc: async () => ({ data: true }),
    }),
  };
  vm.runInNewContext(js, context);
  const req = (origin, body = {}) =>
    new Request("https://example.test", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  expect((await handler(req("https://attacker.test"))).status).toBe(403);
  env.ALLOWED_ORIGIN = "*";
  expect((await handler(req("*"))).status).toBe(403);
  env.ALLOWED_ORIGIN = "https://blesscon.test";
  const r = await handler(
    req("https://blesscon.test", { email: "bad", role: "superuser" }),
  );
  expect(r.status).toBe(400);
  expect(r.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://blesscon.test",
  );
});
