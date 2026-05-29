/**
 * Creates recurring_booking_exceptions table (idempotent).
 *
 * Usage: npx dotenv-cli -e .env.local -- tsx scripts/apply-recurring-exceptions-schema.ts
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
  `CREATE TABLE IF NOT EXISTS recurring_booking_exceptions (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    recurring_booking_id varchar NOT NULL REFERENCES recurring_bookings(id) ON DELETE CASCADE,
    date text NOT NULL,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS recurring_booking_exceptions_rule_date
    ON recurring_booking_exceptions (recurring_booking_id, date)`,
];

const run = async () => {
  console.log("[migrate] recurring_booking_exceptions");
  for (const query of statements) {
    const preview = query.replace(/\s+/g, " ").slice(0, 72);
    console.log(`[migrate] ${preview}…`);
    await sql(query);
  }
  console.log("[migrate] Done");
};

run().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
