import { MemStorage } from "./storage";
import type { IStorage } from "./storage";
import { getDatabaseUrl } from "./db-url";

export let storage: IStorage = new MemStorage();

function envFlag(name: string): boolean | null {
  const value = process.env[name];
  if (value == null || value === "") return null;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function shouldSeedOnStartup(): boolean {
  const explicit = envFlag("SEED_DATABASE_ON_STARTUP");
  if (explicit != null) return explicit;
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

async function seedWithRetry(
  dbStorage: { seed(): Promise<void> },
  retries = 5,
  delayMs = 2000,
) {
  for (let i = 0; i < retries; i++) {
    try {
      await dbStorage.seed();
      return;
    } catch (err) {
      console.error(`[storage] Seed error (attempt ${i + 1}/${retries}):`, err);
      if (i < retries - 1) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }
}

function hasSeed(target: IStorage): target is IStorage & { seed(): Promise<void> } {
  return typeof (target as { seed?: unknown }).seed === "function";
}

async function initStorage() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.log("[storage] DATABASE_URL not set — using in-memory storage");
    return;
  }
  console.log("[storage] DATABASE_URL is set — attempting to use PostgreSQL...");
  console.log("[storage] DATABASE_URL starts with:", dbUrl.slice(0, 30) + "...");
  try {
    console.log("[storage] Step 1: importing pg module...");
    const pgModule = await import("pg");
    console.log("[storage] Step 1: pg module imported");
    
    console.log("[storage] Step 2: creating pg.Pool...");
    const pool = new pgModule.Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 5000,
    });
    console.log("[storage] Step 2: pg.Pool created");
    
    console.log("[storage] Step 3: testing query...");
    const res = await pool.query("SELECT 1 as test");
    console.log("[storage] Step 3: query passed:", res.rows);
    
    console.log("[storage] Step 4: importing drizzle...");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { db: dbInst } = await import("./db");
    console.log("[storage] Step 4: drizzle imported, dbInst type:", typeof dbInst);
    
    if (!dbInst) {
      throw new Error("db instance is null");
    }
    
    console.log("[storage] Step 5: testing db query...");
    await dbInst.execute(dbInst.sql`SELECT 1 as test`);
    console.log("[storage] Step 5: db query passed");
    
    console.log("[storage] Step 6: creating DbStorage...");
    const { DbStorage } = await import("./storage-db");
    storage = new DbStorage();
    console.log("[storage] Step 6: DbStorage created");
    
    // Test DbStorage
    console.log("[storage] Step 7: testing DbStorage.getUser...");
    await storage.getUser("test-id-000");
    console.log("[storage] Step 7: DbStorage getUser passed");
    
    console.log("[storage] PostgreSQL connected successfully");
  } catch (err: any) {
    console.error("[storage] PostgreSQL connection failed at step:", {
      error: err?.message,
      code: err?.code,
      stack: err?.stack?.split('\n').slice(0, 5).join(' | '),
    });
    storage = new MemStorage();
  }

  // Безопасные миграции колонок тарифов запускаются и на Vercel,
  // где полный seed пропускается (NODE_ENV=production).
  // НЕ блокируем холодный старт лямбды дольше 3 секунд: если БД
  // медленная или недоступна, запросы начнут обрабатываться сразу,
  // а сами миграции (идемпотентные) продолжат выполняться в фоне.
  const pricingMigration = dbStorage.ensurePricingSchema?.().catch((err) => {
    console.error("[storage] Pricing schema ensure failed:", err);
  });
  const startupDeadline = new Promise<void>((resolve) =>
    setTimeout(resolve, 3000),
  );
  await Promise.race([pricingMigration ?? Promise.resolve(), startupDeadline]);

  if (hasSeed(dbStorage) && shouldSeedOnStartup()) {
    await seedWithRetry(dbStorage);
  } else if (hasSeed(dbStorage)) {
    console.log("[storage] Startup seed skipped. Set SEED_DATABASE_ON_STARTUP=true to run it.");
  }
}

const storageInitPromise = initStorage().catch((err) => {
  console.error("[storage] Failed to initialize database storage, fallback to in-memory:", err);
  storage = new MemStorage();
});

/** Wait until DB storage (and seed migrations) are ready — call before handling API traffic. */
export async function ensureStorageReady(): Promise<void> {
  await storageInitPromise;
}

void storageInitPromise;

if (!getDatabaseUrl()) {
  console.log("[storage] DATABASE_URL not set — using in-memory storage");
}
