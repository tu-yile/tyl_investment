import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react()],
  build: {
    outDir: path.resolve(rootDir, "../../../dist/dashboard/client"),
    emptyOutDir: false,
  },
});
