import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    // Force client-side Svelte imports for testing
    conditions: ["browser", "svelte"],
  },
  test: {
    // Use edge-runtime for convex tests, node for other tests
    environmentMatchGlobs: [
      ["convex/**", "edge-runtime"],
      ["src/**", "node"],
    ],
    server: { deps: { inline: ["convex-test"] } },
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
