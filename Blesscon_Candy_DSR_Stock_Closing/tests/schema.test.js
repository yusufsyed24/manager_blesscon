import { it, expect } from "vitest";
import { database, A, B, as } from "./db-helper.js";
it("schema installs and all public tables use RLS; settings are admin-only", async () => {
  const db = await database();
  const r = await db.query(
    `select tablename from pg_tables where schemaname='public' and not rowsecurity`,
  );
  expect(r.rows).toEqual([]);
  await as(db, B, async () => {
    expect((await db.query("select * from public.settings")).rows).toHaveLength(
      0,
    );
  });
  await as(db, A, async () => {
    expect((await db.query("select * from public.settings")).rows).toHaveLength(
      1,
    );
  });
  await db.close();
}, 30000);
