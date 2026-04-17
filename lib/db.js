import { Pool } from "pg";

const globalForDb = globalThis;

export const pool =
  globalForDb.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

if (!globalForDb.pool) {
  globalForDb.pool = pool;
}
