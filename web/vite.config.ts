import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the dashboard runs on :5173 and forwards /api to the API on :3000.
// In production the API serves the built dashboard itself (see api/src/app.ts).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
});
