import { DbStorage } from "./storage-db";
import type { IStorage } from "./storage";

export const storage: IStorage = new DbStorage();

// Seed initial data with retry in case tables are not yet ready
async function seedWithRetry(retries = 5, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await (storage as DbStorage).seed();
      return;
    } catch (err) {
      console.error(`[storage] Seed error (attempt ${i + 1}/${retries}):`, err);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
}

seedWithRetry();
