import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const configuredBasePath = loadEnv(mode, ".", "").VITE_BASE_PATH ?? "/";
  const base = configuredBasePath === "/" ? "/" : `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}/`;

  return {
    base,
    plugins: [react()],
  };
});
