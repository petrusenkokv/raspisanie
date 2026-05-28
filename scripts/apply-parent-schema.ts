/**
 * Applies parent-mode schema changes to production Postgres (idempotent).
 * Use when drizzle-kit push fails over the network (ECONNRESET).
 *
 * Usage: npx dotenv-cli -e .env.local -- tsx scripts/apply-parent-schema.ts
 */
import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  console.error("Missing DATABASE_URL / POSTGRES_URL_NON_POOLING");
  process.exit(1);
}

const sql = neon(connectionString);

const statements = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS mother_full_name text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS mother_phone text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS father_full_name text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS father_phone text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_full_name text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_phone text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_representative_confirmed boolean NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_parent boolean NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_also_student boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS parent_children (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    parent_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamp DEFAULT now()
  )`,
];

const run = async () => {
  console.log("[migrate] Using Neon serverless driver");

  for (const query of statements) {
    const preview = query.replace(/\s+/g, " ").slice(0, 72);
    console.log(`[migrate] ${preview}…`);
    await sql(query);
  }

  console.log("[migrate] Parent schema is up to date");
};

run().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
