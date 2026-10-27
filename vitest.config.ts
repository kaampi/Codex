import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // packages/service has its own node:test suite (run via `npm test` in
    // that workspace), not vitest — exclude it so `vitest run` at the repo
    // root only covers the schema package's own tests/.
    include: ["tests/**/*.test.ts"]
  }
});
