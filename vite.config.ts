import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  plugins: [react(), tailwindcss(), jsxLocPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // 👇 هذا يحل مشكلة "@shared/const"
      "@shared": path.resolve(process.cwd(), "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: { port: 5173 },
});
