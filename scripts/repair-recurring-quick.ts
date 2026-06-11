import fs from "fs";
import path from "path";
import pg from "pg";

const envPath = path.resolve(process.cwd(), ".env.vercel.tmp");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 15000 });

const STUDENTS = [
  { id: "34c76490-89eb-4936-adcf-c724484bdf2d", ruleId: "dd6ea446-2ca4-4dbe-b923-e026766e0040" },
  { id: "ac674104-98ba-4e7f-87c6-a017391c6ac3", ruleId: "3b9cdce4-a1c7-49c2-a441-2cee28c670b8" },
  { id: "8829d526-0097-4177-a3ab-fce1c00f4af8", ruleId: "7ded853f-c593-42d1-a9bf-bebec040d21f" },
];

const main = async () => {
  const dates = ["2026-06-11", "2026-06-13", "2026-06-16", "2026-06-18", "2026-06-20"];
  for (const date of dates) {
    let slotId: string;
    const existing = await pool.query(
      `SELECT id FROM time_slots WHERE date = $1 AND time = '09:00' LIMIT 1`,
      [date],
    );
    if (existing.rows[0]) {
      slotId = existing.rows[0].id;
      await pool.query(
        `UPDATE time_slots SET is_blocked = false, block_reason = NULL WHERE id = $1`,
        [slotId],
      );
    } else {
      const ins = await pool.query(
        `INSERT INTO time_slots (date, time, max_capacity, is_manual_capacity, is_blocked, block_reason)
         VALUES ($1, '09:00', 3, false, false, NULL) RETURNING id`,
        [date],
      );
      slotId = ins.rows[0].id;
    }

    for (const s of STUDENTS) {
      const dup = await pool.query(
        `SELECT id FROM bookings WHERE student_id = $1 AND time_slot_id = $2 AND status != 'cancelled'`,
        [s.id, slotId],
      );
      if (dup.rows.length > 0) continue;
      await pool.query(
        `INSERT INTO bookings (student_id, time_slot_id, status, booked_by, notes, recurring_booking_id, confirmed_at)
         VALUES ($1, $2, 'confirmed', $3, 'Постоянная запись', $4, NOW())`,
        [s.id, slotId, "8829d526-0097-4177-a3ab-fce1c00f4af8", s.ruleId],
      );
    }
    console.log("fixed", date, slotId);
  }
  await pool.end();
};

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
