import type { ManifestV3Export } from "@crxjs/vite-plugin";
import packageInfo from "../package.json" with { type: "json" };

export default function createManifest(target?: string): ManifestV3Export {
  const isFirefox = target === "firefox";
  const manifest = {
    manifest_version: 3,
    name: "MTcord",
    short_name: "MTcord",
    version: packageInfo.version,
    description: "Browse, export, download, and delete your Discord messages.",
    permissions: ["activeTab"],
    host_permissions: [
      "https://discord.com/*",
      "https://cdn.discordapp.com/*",
      "https://media.discordapp.net/*",
    ],
    background: isFirefox
      ? { scripts: ["src/background.ts"], type: "module" }
      : { service_worker: "src/background.ts", type: "module" },
    action: {
      default_title: "Open MTcord",
    },
    content_scripts: [
      {
        matches: ["https://discord.com/*"],
        js: ["src/content.ts"],
        run_at: "document_idle",
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    ...(isFirefox
      ? {
          browser_specific_settings: {
            gecko: {
              id: "@micknorj.tools-mtcord",
              data_collection_permissions: {
                required: ["none"],
              },
              strict_min_version: "140.0",
            },
            gecko_android: { strict_min_version: "142.0" },
          },
        }
      : {}),
  };
  return manifest as unknown as ManifestV3Export;
}
