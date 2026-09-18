import { crx, type ManifestV3Export } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./src/manifest";

export default defineConfig(() => ({
  build: {
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      input: { app: "index.html" },
    },
  },
  plugins: [
    react(),
    crx({ manifest: manifest(process.env.MTCORD_TARGET) as ManifestV3Export }),
  ],
}));
