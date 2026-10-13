import { drizzle } from "drizzle-orm/node-postgres";
import { getDatabaseUrl } from "./db-url";
import * as schema from "@shared/schema";

let pool: any = null;
let dbInstance: any = null;

/** Lazily create the DB pool and drizzle instance. */
export function getDbInstance() {
  if (dbInstance) return dbInstance;
  
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.log("[db] DATABASE_URL not set — database features disabled");
    return null;
  }
  
  if (!pool) {
    try {
      const { getPgPool } = require("./pg-pool");
      pool = getPgPool();
      console.log("[db] PostgreSQL pool created successfully");
    } catch (err: any) {
      console.error("[db] Failed to create PostgreSQL pool:", err?.message || err);
      return null;
    }
  }
  
  dbInstance = drizzle(pool, { schema });
  console.log("[db] Drizzle instance created");
  
  // Apply schema migrations automatically
  async function applyMigrations() {
    const client = await pool.connect();
    try {
      await client.query(`
        ALTER TABLE membership_payments ADD COLUMN IF NOT EXISTS effective_start_date TEXT;
      `);
      console.log("[db] Migrations applied successfully");
    } catch (error: any) {
      console.error("[db] Migration failed:", error?.message || error);
    } finally {
      client.release();
    }
  }
  
  applyMigrations().catch(console.error);
  return dbInstance;
}

// Lazy proxy — creates the instance on first access
export const db = new Proxy({} as any, {
  get(_target, prop) {
    const instance = getDbInstance();
    if (!instance) {
      throw new Error("Database not initialized — DATABASE_URL is not set or connection failed");
    }
    return instance[prop];
  },
  set(_target, prop, value) {
    const instance = getDbInstance();
    if (!instance) {
      throw new Error("Database not initialized — DATABASE_URL is not set or connection failed");
    }
    instance[prop] = value;
    return true;
  },
});

export type DB = typeof db;
