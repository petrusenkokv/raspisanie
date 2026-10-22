// Database initialization is done in storage-instance.ts
// This file is kept for backward compatibility
import { sql } from "drizzle-orm";

// Тип any (а не null) осознан: debug-роуты обращаются к db.execute/db.sql,
// а TS иначе ругается на "possibly null". Реальный инстанс создаётся в storage-db.ts.
export const db: any = null;
export { sql as drizzleSql };
export type DB = typeof db;
