import { drizzle } from "drizzle-orm/node-postgres";
import { getPgPool } from "./pg-pool";
import { getDatabaseUrl } from "./db-url";
import * as schema from "@shared/schema";

if (!getDatabaseUrl()) {
  throw new Error("DATABASE_URL is not set");
}

export const db = drizzle(getPgPool(), { schema });
export type DB = typeof db;
