import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// npm test — jedinični testovi, bez baze.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/*.db.test.ts", "node_modules/**"],
    environment: "node",
  },
});
