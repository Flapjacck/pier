import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** pier-backend default when running `pnpm dev` in backend/ */
const backendOrigin = "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      // Keep Host as localhost:5173 so it matches the browser Origin on cookie mutations
      // (backend auth rejects POST/PUT/PATCH/DELETE when Origin host !== Host).
      "/health": { target: backendOrigin, changeOrigin: false },
      "/api": { target: backendOrigin, changeOrigin: false },
    },
  },
});
