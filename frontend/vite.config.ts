import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DEV_HOST = "127.0.0.1";
const DEV_PORT = 34116;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: DEV_HOST,
    port: DEV_PORT,
    strictPort: true,
    hmr: {
      host: DEV_HOST,
      protocol: "ws",
      port: DEV_PORT,
      clientPort: DEV_PORT,
    },
  },
});
