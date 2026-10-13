import * as schema from "@shared/schema";

let pool: any = null;
let dbInstance: any = null;

/** Lazily create the DB pool and drizzle instance. */
async function ensureDb() {
  if (dbInstance) return dbInstance;
  
  const { getDatabaseUrl } = await import("./db-url");
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.log("[db] DATABASE_URL not set — database features disabled");
    return null;
  }
  
  if (!pool) {
    try {
      const pgModule = await import("pg");
      pool = new pgModule.Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
      });
      console.log("[db] PostgreSQL pool created successfully");
      
      const { drizzle } = await import("drizzle-orm/node-postgres");
      dbInstance = drizzle(pool, { schema });
      console.log("[db] Drizzle instance created");
    } catch (err: any) {
      console.error("[db] Failed to create PostgreSQL pool:", err?.message || err);
    }
  }
  
  return dbInstance;
}

// Lazy proxy — creates the instance on first access
export const db = new Proxy({} as any, {
  async get(_target, prop) {
    const instance = await ensureDb();
    if (!instance) {
      throw new Error("Database not initialized — DATABASE_URL is not set or connection failed");
    }
    return instance[prop];
  },
  set(_target, prop, value) {
    if (!dbInstance) {
      throw new Error("Database not initialized");
    }
    dbInstance[prop] = value;
    return true;
  },
});

export type DB = typeof db;
