import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // The server checks that Origin matches Host, so the dev proxy must
      // pass the browser's Host header through unchanged.
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: false },
    },
  },
});
