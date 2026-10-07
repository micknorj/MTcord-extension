import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${version}`);
export const targets = ["chromium", "firefox"];

export function collectFiles(directory) {
  const files = {};
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in release: ${path}`);
      if (entry.isDirectory()) walk(path);
      else files[relative(directory, path).replaceAll("\\", "/")] = new Uint8Array(readFileSync(path));
    }
  }
  walk(directory);
  return files;
}

export function verifyExtensionFiles(files, target) {
  if (!targets.includes(target)) throw new Error(`Unknown browser target: ${target}`);
  const decoder = new TextDecoder();
  const requireFile = (name) => {
    if (typeof name !== "string" || name.startsWith("/") || name.split("/").some((part) => !part || part === "." || part === "..") || !(name in files)) {
      throw new Error(`Missing or invalid release file: ${name}`);
    }
    return decoder.decode(files[name]);
  };
  const manifest = JSON.parse(requireFile("manifest.json"));
  if (manifest.version !== version || manifest.manifest_version !== 3 || manifest.name !== "MTcord") {
    throw new Error("Release manifest version or identity does not match package.json");
  }
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(["activeTab"])) throw new Error("Unexpected extension permissions");
  const hosts = ["https://discord.com/*", "https://cdn.discordapp.com/*", "https://media.discordapp.net/*"];
  if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(hosts)) throw new Error("Unexpected host permissions");
  if (target === "chromium") {
    if (!manifest.background?.service_worker || manifest.background.scripts || manifest.browser_specific_settings) throw new Error("Invalid Chromium background manifest");
    requireFile(manifest.background.service_worker);
  } else {
    if (!manifest.background?.scripts?.length || manifest.background.service_worker || manifest.browser_specific_settings?.gecko?.id !== "@micknorj.tools-mtcord") {
      throw new Error("Invalid Firefox background manifest");
    }
    for (const name of manifest.background.scripts) requireFile(name);
  }
  for (const script of manifest.content_scripts ?? []) for (const name of script.js ?? []) requireFile(name);
  for (const resource of manifest.web_accessible_resources ?? []) for (const name of resource.resources ?? []) requireFile(name);
  for (const match of requireFile("index.html").matchAll(/(?:src|href)="([^"]+)"/g)) requireFile(match[1].replace(/^\.?\//, ""));
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md", "licenses/react.txt", "licenses/react-dom.txt", "licenses/scheduler.txt", "licenses/fflate.txt"]) requireFile(name);
  for (const [name, bytes] of Object.entries(files)) {
    if (name.includes("\\") || name.split("/").some((part) => part.startsWith(".")) || /(?:\.map|\.log|\.ts|\.tsx|\.zip)$/i.test(name) || /(?:^|\/)(?:tests|node_modules|src|package-lock\.json)(?:\/|$)/i.test(name)) {
      throw new Error(`Development or private file in release: ${name}`);
    }
    if (name.endsWith(".js")) {
      const code = decoder.decode(bytes);
      for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']+)["']/g)) {
        requireFile(posix.normalize(posix.join(posix.dirname(name), match[1])));
      }
    }
  }
  return manifest;
}
