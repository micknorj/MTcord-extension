import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { zipSync } from "fflate";
import { collectFiles, root, targets, verifyExtensionFiles, version } from "./release-utils.mjs";

const output = resolve(root, "packages");
mkdirSync(output, { recursive: true });
const hashes = [];
for (const target of targets) {
  const files = collectFiles(resolve(root, "dist", target));
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    files[name] = new Uint8Array(readFileSync(resolve(root, name)));
  }
  for (const dependency of ["react", "react-dom", "scheduler", "fflate"]) {
    files[`licenses/${dependency}.txt`] = new Uint8Array(readFileSync(resolve(root, "node_modules", dependency, "LICENSE")));
  }
  verifyExtensionFiles(files, target);
  const filename = `MTcord-v${version}-${target}.zip`;
  const zip = zipSync(files, { level: 9, mtime: new Date(2000, 0, 1) });
  writeFileSync(resolve(output, filename), zip);
  hashes.push(`${createHash("sha256").update(zip).digest("hex")}  ${filename}`);
  console.log(`Packaged ${filename} (${zip.length} bytes)`);
}
writeFileSync(resolve(output, "SHA256SUMS.txt"), `${hashes.join("\n")}\n`);
