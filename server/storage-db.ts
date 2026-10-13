import { eq, and, or, ne, asc, desc, inArray, gte, lte, lt, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDatabaseUrl } from "./db-url";
import * as schema from "@shared/schema";

console.log("[storage-db] Module loading...");

let pool: any = null;
let dbInstance: any = null;

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  console.log("[storage-db] DATABASE_URL not set — database features disabled");
} else {
  try {
    const pgModule = await import("pg");
    pool = new pgModule.Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    dbInstance = drizzle(pool, { schema });
    console.log("[storage-db] PostgreSQL initialized successfully");
  } catch (err: any) {
    console.error("[storage-db] Failed to initialize PostgreSQL:", err?.message || err);
  }
}

console.log("[storage-db] Module loaded, dbInstance:", typeof dbInstance);

// Export db as a getter
export const db = new Proxy({} as any, {
  get(_target, prop) {
    if (!dbInstance) {
      throw new Error("Database not initialized — check server logs for PostgreSQL errors");
    }
    return dbInstance[prop];
  },
  set(_target, prop, value) {
    if (!dbInstance) {
      throw new Error("Database not initialized");
    }
    dbInstance[prop] = value;
    return true;
  },
});
