import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    host: "127.0.0.1"
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    minify: "esbuild"
  }
});
