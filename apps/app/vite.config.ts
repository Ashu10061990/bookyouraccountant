import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    outDir: "dist",
    // Capacitor ships this bundle inside the native binary — no source maps.
    sourcemap: false,
  },
});
