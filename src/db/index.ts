import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

// Never throw at import time. Without a database the game still runs fully
// (all progress is stored locally in the browser) and /api/health reports
// {"ok":false}. The pool points at a closed port so connection attempts fail
// fast and are handled gracefully by each caller.
const globalForDb = globalThis as typeof globalThis & {
  __streetversePostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__streetversePostgresqlPool ??
  new Pool({
    connectionString: databaseUrl ?? "postgresql://127.0.0.1:1/streetverse_unavailable",
  });

if (!databaseUrl) {
  console.warn("[db] DATABASE_URL is not set — /api/health will report ok:false until it is configured.");
}

if (process.env.NODE_ENV !== "production") {
  globalForDb.__streetversePostgresqlPool = pool;
}

export const db = drizzle(pool);
