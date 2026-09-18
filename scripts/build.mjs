import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vite = resolve(root, "node_modules", "vite", "bin", "vite.js");

rmSync(resolve(root, "dist"), { recursive: true, force: true });

for (const target of ["chromium", "firefox"]) {
  const result = spawnSync(process.execPath, [vite, "build", "--outDir", `dist/${target}`], {
    cwd: root,
    env: { ...process.env, MTCORD_TARGET: target },
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
