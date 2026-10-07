import test from "node:test";
import assert from "node:assert/strict";
import { verifyExtensionFiles, version } from "../scripts/release-utils.mjs";

function fixture(target = "chromium") {
  const manifest = {
    manifest_version: 3, name: "MTcord", version, permissions: ["activeTab"],
    host_permissions: ["https://discord.com/*", "https://cdn.discordapp.com/*", "https://media.discordapp.net/*"],
    background: target === "firefox" ? { scripts: ["background.js"] } : { service_worker: "background.js" },
    content_scripts: [{ js: ["content.js"] }],
    ...(target === "firefox" ? { browser_specific_settings: { gecko: { id: "@micknorj.tools-mtcord" } } } : {}),
  };
  const encode = (text) => new TextEncoder().encode(text);
  const files = {
    "manifest.json": encode(JSON.stringify(manifest)), "index.html": encode('<script src="/app.js"></script>'),
    "app.js": encode(""), "background.js": encode(""), "content.js": encode(""),
  };
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md", "licenses/react.txt", "licenses/react-dom.txt", "licenses/scheduler.txt", "licenses/fflate.txt"]) files[name] = encode("License");
  return files;
}

test("validates both native browser manifests", () => {
  for (const target of ["chromium", "firefox"]) assert.equal(verifyExtensionFiles(fixture(target), target).version, version);
});
test("rejects packages missing runtime assets or license terms", () => {
  for (const missing of ["app.js", "content.js", "LICENSE", "licenses/react.txt", "licenses/scheduler.txt"]) {
    const files = fixture(); delete files[missing];
    assert.throws(() => verifyExtensionFiles(files, "chromium"), /Missing or invalid release file/);
  }
});
test("rejects stale manifest versions and expanded permissions", () => {
  for (const override of [{ version: "0.0.0" }, { permissions: ["activeTab", "tabs"] }]) {
    const files = fixture();
    files["manifest.json"] = new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(files["manifest.json"])), ...override }));
    assert.throws(() => verifyExtensionFiles(files, "chromium"));
  }
});
test("rejects development files, path traversal, and missing imported chunks", () => {
  for (const name of ["assets/app.js.map", "../private.json", ".env", "node_modules/secret.js"]) {
    const files = fixture(); files[name] = new Uint8Array();
    assert.throws(() => verifyExtensionFiles(files, "chromium"), /Development or private file/);
  }
  const files = fixture(); files["background.js"] = new TextEncoder().encode('import "./missing.js";');
  assert.throws(() => verifyExtensionFiles(files, "chromium"), /missing.js/);
});
