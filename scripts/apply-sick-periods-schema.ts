/**
 * Creates sick_periods table (idempotent).
 * Usage: npx dotenv-cli -e .env.local -- tsx scripts/apply-sick-periods-schema.ts
 */
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

const statements = [
  `CREATE TABLE IF NOT EXISTS sick_periods (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    student_id varchar NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS sick_periods_student_id_idx ON sick_periods (student_id)`,
];

const run = async () => {
  for (const query of statements) {
    console.log(`[migrate] ${query.slice(0, 60).replace(/\s+/g, " ")}…`);
    await sql(query);
  }
  console.log("[migrate] sick_periods schema is up to date");
};

run().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
