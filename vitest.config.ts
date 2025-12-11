import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Use edge-runtime for convex tests, jsdom/node for frontend tests
    environmentMatchGlobs: [
      ["convex/**", "edge-runtime"],
      ["src/**", "node"],
    ],
    server: { deps: { inline: ["convex-test"] } },
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
    globals: true,
  },
});
