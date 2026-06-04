/**
 * Applies services & document pricing schema (idempotent).
 * Usage: npx dotenv-cli -e .env.local -- tsx scripts/apply-services-schema.ts
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
  `CREATE TABLE IF NOT EXISTS trainer_services (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    price_rub integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    is_default boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp DEFAULT now()
  )`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'required'`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS price_surcharge_rub integer`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_service_id varchar`,
  `UPDATE documents SET kind = 'pricing', price_surcharge_rub = COALESCE(price_surcharge_rub, 500)
   WHERE title ILIKE '%фото%' OR title ILIKE '%видео%'`,
];

const run = async () => {
  for (const query of statements) {
    console.log(`[migrate] ${query.slice(0, 60).replace(/\s+/g, " ")}…`);
    await sql(query);
  }
  const existing = await sql`SELECT COUNT(*)::int AS c FROM trainer_services`;
  if ((existing[0] as { c: number }).c === 0) {
    await sql`
      INSERT INTO trainer_services (name, price_rub, is_active, is_default, sort_order)
      VALUES ('Тренировка', 500, true, true, 0)
    `;
    console.log("[migrate] Default service «Тренировка» created");
  }
  console.log("[migrate] Services & pricing schema is up to date");
};

run().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
