import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { garminServer } from "./garmin-server.js";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), garminServer()],
  server: {
    port: 5173,
    // Server Whoop (folder whoop-esport, port 3201). Jalur /api/garmin ditangani plugin Garmin, bukan proxy.
    proxy: {
      "/whoop/": "http://localhost:3201",
      "/api/whoop": "http://localhost:3201",
      "/api/athletes": "http://localhost:3201",
    },
  },
  build: { outDir: "../dist-web", emptyOutDir: true },
});
