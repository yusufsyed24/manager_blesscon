import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
export const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  C = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
export async function database() {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(
    await fs.readFile(
      new URL("../supabase/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await fs.readFile(
      new URL("../supabase/operational_modules.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    `insert into auth.users values('${A}','admin@test.test'),('${B}','b@test.test'),('${C}','c@test.test'); insert into public.profiles(id,display_name) values('${A}','Admin'),('${B}','One'),('${C}','Two'); insert into public.user_roles(user_id,role) values('${A}','admin'),('${B}','salesman'),('${C}','salesman'); select set_config('request.jwt.claim.sub','${A}',false);`,
  );
  return db;
}
export async function as(db, id, fn) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`,
  );
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
