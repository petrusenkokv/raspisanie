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
  try {
    // Test db proxy — this will trigger lazy initialization
    console.log("[storage] Testing db proxy...");
    const { db } = await import("./db");
    console.log("[storage] db imported, type:", typeof db);
    
    await db.execute(db.sql`SELECT 1 as test`);
    console.log("[storage] PostgreSQL query passed");
    
    // Now create DbStorage
    const { DbStorage } = await import("./storage-db");
    storage = new DbStorage();
    console.log("[storage] DbStorage created successfully");
    
    // Test DbStorage
    await storage.getUser("test-id-000");
    console.log("[storage] DbStorage getUser passed");
    
    console.log("[storage] PostgreSQL connected successfully");
  } catch (err: any) {
    console.error("[storage] PostgreSQL connection failed:", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack?.split('\n').slice(0, 5).join(' | '),
    });
    storage = new MemStorage();
  }

  // Safe migrations
  const { db } = await import("./db");
  const pricingMigration = (storage as any).ensurePricingSchema?.().catch((err: any) => {
    console.error("[storage] Pricing schema ensure failed:", err);
  });
  const startupDeadline = new Promise<void>((resolve) =>
    setTimeout(resolve, 3000),
  );
  await Promise.race([pricingMigration ?? Promise.resolve(), startupDeadline]);

  if (hasSeed(storage) && shouldSeedOnStartup()) {
    await seedWithRetry(storage);
  } else if (hasSeed(storage)) {
    console.log("[storage] Startup seed skipped.");
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
