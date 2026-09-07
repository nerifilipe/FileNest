import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dedicated ports keep automated tests away from the user's running app.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8001" },
  },
});
