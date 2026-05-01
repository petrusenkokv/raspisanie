import { DbStorage } from "./storage-db";
import type { IStorage } from "./storage";

export const storage: IStorage = new DbStorage();

// Seed initial data (trainer account, default documents, time slots)
(storage as DbStorage).seed().catch((err) => {
  console.error("[storage] Seed error:", err);
});
