import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

/** Same gateway as clienteling: orchestration on 3000 proxies `/api/*` → worker, `/v1/chat` → invoke. */
const ORCHESTRATION = "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
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
