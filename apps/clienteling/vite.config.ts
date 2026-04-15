import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

/** Orchestration proxies `/api/*` to the worker; `/v1/chat` invokes the graph. */
const ORCHESTRATION = "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: ORCHESTRATION, changeOrigin: true },
      "/v1": { target: ORCHESTRATION, changeOrigin: true },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
