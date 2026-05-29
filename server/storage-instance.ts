import { MemStorage } from "./storage";
import type { IStorage } from "./storage";

export let storage: IStorage = new MemStorage();

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
  if (!process.env.DATABASE_URL) {
    return;
  }
  const { DbStorage } = await import("./storage-db");
  const dbStorage = new DbStorage();
  storage = dbStorage;
  if (hasSeed(dbStorage)) {
    await seedWithRetry(dbStorage);
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

if (!process.env.DATABASE_URL) {
  console.log("[storage] DATABASE_URL not set — using in-memory storage");
}
