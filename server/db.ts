import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDatabaseUrl } from "./db-url";
import * as schema from "@shared/schema";

let pool: Pool | null = null;
let dbInstance: any = null;

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.log("[db] DATABASE_URL not set — database features disabled");
} else {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    console.log("[db] PostgreSQL pool created successfully");
    
    dbInstance = drizzle(pool, { schema });
    console.log("[db] Drizzle instance created");
  } catch (err: any) {
    console.error("[db] Failed to create PostgreSQL pool:", err?.message || err);
  }
}

export { dbInstance as db, pool };
export type DB = typeof dbInstance;
