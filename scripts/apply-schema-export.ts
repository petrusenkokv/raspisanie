/**
 * Applies scripts/schema-export.sql to the database via Neon serverless driver.
 * Usage: npx dotenv-cli -e .env.local -- tsx scripts/apply-schema-export.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = neon(connectionString);
const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema-export.sql");
const raw = readFileSync(schemaPath, "utf8");

const statements = raw
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

const run = async () => {
  console.log(`[schema] Applying ${statements.length} statements…`);
  for (const statement of statements) {
    const preview = statement.replace(/\s+/g, " ").slice(0, 72);
    console.log(`[schema] ${preview}…`);
    try {
      await sql(statement);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "42P07" || code === "42710") {
        console.log("[schema] skip (already exists)");
        continue;
      }
      throw err;
    }
  }
  console.log("[schema] Done");
};

run().catch((err) => {
  console.error("[schema] Failed:", err);
  process.exit(1);
});
