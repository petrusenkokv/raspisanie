// Database initialization is done in storage-instance.ts
// This file is kept for backward compatibility
import { sql } from "drizzle-orm";

export const db = null;
export { sql as drizzleSql };
export type DB = typeof db;
