import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { root, targets, verifyExtensionFiles, version } from "./release-utils.mjs";

const output = resolve(root, "packages");
const hashes = new Map(readFileSync(resolve(output, "SHA256SUMS.txt"), "utf8").trim().split(/\r?\n/).map((line) => {
  const match = /^([a-f0-9]{64})  (MTcord-v[\d.]+-(?:chromium|firefox)\.zip)$/.exec(line);
  if (!match) throw new Error("Malformed checksum entry");
  return [match[2], match[1]];
}));
if (hashes.size !== targets.length) throw new Error("Expected exactly two release checksums");
for (const target of targets) {
  const name = `MTcord-v${version}-${target}.zip`;
  const bytes = readFileSync(resolve(output, name));
  if (hashes.get(name) !== createHash("sha256").update(bytes).digest("hex")) throw new Error(`Checksum mismatch: ${name}`);
  const files = unzipSync(bytes);
  verifyExtensionFiles(files, target);
  console.log(`Verified ${name}: ${Object.keys(files).length} files; SHA-256 matches`);
}
