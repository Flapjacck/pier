import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** pier-backend default when running `pnpm dev` in backend/ */
const backendOrigin = "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      "/health": { target: backendOrigin, changeOrigin: true },
      "/cluster": { target: backendOrigin, changeOrigin: true },
    },
  },
});
