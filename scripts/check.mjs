import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import ts from "typescript";
for (const folder of ["js", "tests"])
  for (const file of await fs.readdir(folder)) {
    if (!file.endsWith(".js")) continue;
    const r = spawnSync(process.execPath, ["--check", folder + "/" + file], {
      encoding: "utf8",
    });
    if (r.status) throw Error(r.stderr);
  }
const src = await fs.readFile(
  "supabase/functions/admin-create-user/index.ts",
  "utf8",
);
const result = ts.transpileModule(src, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
  reportDiagnostics: true,
});
if (result.diagnostics?.length) throw Error(JSON.stringify(result.diagnostics));
const config = await fs.readFile("app_config.js", "utf8");
if (/service_role|sb_secret_/.test(config.replace(/\/\/.*$/gm, "")))
  throw Error("Secret in browser config");
const html = await fs.readFile("index.html", "utf8");
for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!m[1].startsWith("http")) await fs.access(m[1]);
}
if ((await fs.stat("assets/logo.jpeg")).size > 60000)
  throw Error("Logo exceeds 60 KB");
console.log(
  "Syntax, Edge TypeScript transpilation, local assets, logo size and public config checks passed.",
);
