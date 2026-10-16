import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const dest = path.join(root, "web");
await fs.mkdir(dest, { recursive: true });
for (const item of [
  "index.html",
  "app_config.js",
  "manifest.json",
  "sw.js",
  "netlify.toml",
  "README_SETUP.md",
  "js",
  "css",
  "assets",
  "vendor",
])
  await fs.cp(path.join(root, item), path.join(dest, item), {
    recursive: true,
    force: true,
  });
console.log(
  "Static deployment folder prepared: web/ (no compilation required).",
);
