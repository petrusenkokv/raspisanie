import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, or, ilike, and, ne, gte } from "drizzle-orm";
import { users, recurringBookings, bookings, timeSlots, trainerSettings } from "../shared/schema";

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
const db = drizzle(pool);

const main = async () => {
  const found = await db
    .select()
    .from(users)
    .where(or(ilike(users.lastName, "%Петрусенко%"), ilike(users.lastName, "%Лисунов%")));

  console.log(
    "USERS:",
    found.map((u) => ({
      id: u.id,
      name: `${u.lastName} ${u.firstName}`,
      role: u.role,
      active: u.isActive,
      pending: u.isPendingApproval,
    })),
  );

  const trainer = await db.select().from(users).where(eq(users.role, "trainer")).limit(1);
  console.log("TRAINER:", trainer[0] ? `${trainer[0].lastName} ${trainer[0].firstName} (${trainer[0].id})` : "none");

  const settings = await db.select().from(trainerSettings).limit(1);
  console.log("SETTINGS:", settings[0]
    ? { dayStartHour: settings[0].dayStartHour, dayEndHour: settings[0].dayEndHour, weeklyTemplate: settings[0].weeklyTemplate?.slice(0, 120) }
    : "none");

  const allRules = await db.select().from(recurringBookings);
  console.log("ALL RECURRING RULES:", allRules);

  for (const u of found) {
    const rules = allRules.filter((r) => r.studentId === u.id);
    console.log(`\n=== ${u.lastName} ${u.firstName} ===`);
    console.log("rules:", rules);

    const activeBookings = await db
      .select({ b: bookings, s: timeSlots })
      .from(bookings)
      .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
      .where(and(eq(bookings.studentId, u.id), ne(bookings.status, "cancelled"), gte(timeSlots.date, "2026-06-09")));

    console.log(
      "upcoming bookings:",
      activeBookings.map((r) => ({
        date: r.s.date,
        time: r.s.time,
        status: r.b.status,
        recurringId: r.b.recurringBookingId,
      })),
    );
  }

  const nineSlots = await db
    .select()
    .from(timeSlots)
    .where(and(eq(timeSlots.date, "2026-06-11"), eq(timeSlots.time, "09:00")));
  console.log("\n9:00 slots on 2026-06-11:", nineSlots);

  const bookingsAt9 = await db
    .select({ b: bookings, s: timeSlots, u: users })
    .from(bookings)
    .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
    .innerJoin(users, eq(bookings.studentId, users.id))
    .where(and(eq(timeSlots.date, "2026-06-11"), eq(timeSlots.time, "09:00"), ne(bookings.status, "cancelled")));
  console.log("bookings at 9:00 on 2026-06-11:", bookingsAt9.map((r) => `${r.u.lastName} ${r.u.firstName} (${r.b.status})`));

  await pool.end();
};

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
