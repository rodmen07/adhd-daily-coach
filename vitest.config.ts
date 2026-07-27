import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    // Playwright owns e2e/** (docs/design/E2E_SMOKE.md D5). Vitest sets no
    // `include`, so its default glob would otherwise claim any *.spec.* file
    // anywhere and execute the browser journeys under jsdom, where they
    // crash on import. The two runners must never see each other's files.
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
    },
  },
});
