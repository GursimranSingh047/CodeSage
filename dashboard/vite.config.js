import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev mode proxies API/WS to the FastAPI backend; production builds are
// served by FastAPI itself (mounted at "/" from dashboard/dist).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/scan": "http://127.0.0.1:8000",
      "/scans": "http://127.0.0.1:8000",
      "/ws": { target: "ws://127.0.0.1:8000", ws: true },
    },
  },
});
