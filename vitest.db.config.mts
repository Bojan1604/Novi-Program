import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// npm run test:db — testovi nad testnom bazom (DATABASE_URL_TEST).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.db.test.ts"],
    globalSetup: ["./scripts/testovi-baza-migracije.ts"],
    setupFiles: ["./scripts/testovi-baza-priprema.ts"],
    environment: "node",
    // testovi dijele jednu bazu: jedan po jedan
    fileParallelism: false,
  },
});
