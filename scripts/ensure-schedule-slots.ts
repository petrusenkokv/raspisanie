/**
 * Ensures time slots exist for the next 30 days (Neon serverless — reliable from local Windows).
 * Usage: npx dotenv-cli -e .env.local -- tsx scripts/ensure-schedule-slots.ts
 */
import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = neon(connectionString);

const localDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const run = async () => {
  const settingsRows = await sql`SELECT day_start_hour, day_end_hour, default_capacity FROM trainer_settings LIMIT 1`;
  const settings = settingsRows[0] as { day_start_hour: number; day_end_hour: number; default_capacity: number } | undefined;
  const startHour = settings?.day_start_hour ?? 8;
  const endHour = settings?.day_end_hour ?? 20;
  const capacity = settings?.default_capacity ?? 2;

  const today = new Date();
  let created = 0;

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const date = localDateStr(d);

    for (let hour = startHour; hour < endHour; hour++) {
      const time = `${String(hour).padStart(2, "0")}:00:00`;
      const existing = await sql`
        SELECT id FROM time_slots WHERE date = ${date}::date AND time = ${time}::time LIMIT 1
      `;
      if (existing.length > 0) continue;

      await sql`
        INSERT INTO time_slots (date, time, max_capacity, is_manual_capacity, is_blocked)
        VALUES (${date}::date, ${time}::time, ${capacity}, false, false)
      `;
      created++;
    }
  }

  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM time_slots`;
  console.log(`[slots] Created ${created} new slots; total in DB: ${c}`);
};

run().catch((err) => {
  console.error("[slots] Failed:", err);
  process.exit(1);
});
