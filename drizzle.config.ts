import { defineConfig } from "drizzle-kit";

// The connection string comes from the environment so the same config works
// locally (.env.local) and in CI/migrations (DATABASE_URL).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
