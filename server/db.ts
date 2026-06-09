import { drizzle } from "drizzle-orm/node-postgres";
import { getPgPool } from "./pg-pool";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const db = drizzle(getPgPool(), { schema });
export type DB = typeof db;
