import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { garminServer } from "./garmin-server.js";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), garminServer()],
  server: { port: 5173 },
  build: { outDir: "../dist-web", emptyOutDir: true },
});
