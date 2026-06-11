import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.vercel.tmp");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  console.error("Set DATABASE_URL or run: vercel env pull .env.vercel.tmp");
  process.exit(1);
}

process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

const { DbStorage } = await import("../server/storage-db");
const { addDaysToDateStr, moscowDateString } = await import("../server/moscow-date");

const storage = new DbStorage();

const main = async () => {
  const today = moscowDateString();
  const horizon = addDaysToDateStr(today, 60);
  console.log(`Materializing recurring bookings until ${horizon}`);

  const result = await storage.materializeRecurringBookings(horizon);
  console.log("materialize:", result);

  const sampleDates = [today, addDaysToDateStr(today, 2), addDaysToDateStr(today, 4)];
  for (const date of sampleDates) {
    const day = await storage.getScheduleForDate(date);
    const nine = day.timeSlots.find((s) => s.time.startsWith("09"));
    console.log(
      date,
      "9:00 slot:",
      nine
        ? `${nine.bookings.length} booking(s), blocked=${nine.isBlocked}`
        : "missing",
    );
  }

  console.log("done");
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
