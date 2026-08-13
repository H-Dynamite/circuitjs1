import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: false,
  server: {
    host: "0.0.0.0",
    port: 5173
  },
  build: {
    target: "es2019",
    sourcemap: true
  }
});
