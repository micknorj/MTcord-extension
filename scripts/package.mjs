import { readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "packages");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const target of ["chromium", "firefox"]) {
  const source = resolve(root, "dist", target);
  const files = {};
  for (const path of walk(source)) {
    files[relative(source, path).replaceAll("\\", "/")] = new Uint8Array(readFileSync(path));
  }
  writeFileSync(resolve(output, `MTcord-v0.1-${target}.zip`), zipSync(files, { level: 9 }));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
