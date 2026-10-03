import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api": "http://localhost:8787",
      "/widget": "http://localhost:5199",
      "/webfonts": "http://localhost:5199",
      "/assets": "http://localhost:5199",
    },
  },
});
