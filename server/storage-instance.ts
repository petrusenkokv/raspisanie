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

if (process.env.DATABASE_URL) {
  const { DbStorage } = await import("./storage-db");
  storage = new DbStorage();
  seedWithRetry(storage);
} else {
  console.log("[storage] DATABASE_URL not set — using in-memory storage");
}
