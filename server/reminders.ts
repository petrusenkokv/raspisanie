import { storage } from "./storage";

const sent24h = new Set<string>();
const sent1h = new Set<string>();

const TICK_MS = 60_000;

function slotStartTime(date: string, time: string): Date | null {
  const iso = `${date}T${time.length === 5 ? time : time.slice(0, 5)}:00+03:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function moscowDateString(d: Date): string {
  // Moscow is fixed UTC+3 (no DST). Shift and read the UTC calendar date.
  return new Date(d.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
}

function dayPrefix(slotDate: string, now: Date): "today" | "tomorrow" | "other" {
  const today = moscowDateString(now);
  const tomorrowMs = now.getTime() + 24 * 60 * 60_000;
  const tomorrow = moscowDateString(new Date(tomorrowMs));
  if (slotDate === today) return "today";
  if (slotDate === tomorrow) return "tomorrow";
  return "other";
}

function formatHuman(date: string, time: string): string {
  return `${date} в ${time}`;
}

async function tick() {
  try {
    const bookings = await storage.listActiveBookings();
    const now = Date.now();

    for (const booking of bookings) {
      const slot = await storage.getTimeSlotById(booking.timeSlotId);
      if (!slot) continue;
      const start = slotStartTime(slot.date, slot.time);
      if (!start) continue;

      const minutesUntil = Math.round((start.getTime() - now) / 60_000);
      if (minutesUntil <= 0) continue;

      const when = formatHuman(slot.date, slot.time.slice(0, 5));
      const prefix = dayPrefix(slot.date, new Date(now));
      const timeOnly = slot.time.slice(0, 5);

      if (
        minutesUntil > 60 &&
        minutesUntil <= 1440 &&
        !sent24h.has(booking.id)
      ) {
        const message =
          prefix === "today"
            ? `Сегодня у вас тренировка в ${timeOnly}`
            : prefix === "tomorrow"
            ? `Завтра у вас тренировка в ${timeOnly}`
            : `Скоро тренировка: ${when}`;
        await storage.createNotification({
          userId: booking.studentId,
          type: "training_reminder",
          title: "Напоминание о тренировке",
          message,
          relatedBookingId: booking.id,
        });
        sent24h.add(booking.id);
      }

      if (minutesUntil > 0 && minutesUntil <= 60 && !sent1h.has(booking.id)) {
        await storage.createNotification({
          userId: booking.studentId,
          type: "training_reminder",
          title: "Тренировка через час",
          message: `Через час у вас тренировка: ${when}`,
          relatedBookingId: booking.id,
        });
        sent1h.add(booking.id);
      }
    }

    if (sent24h.size > 5000 || sent1h.size > 5000) {
      const activeIds = new Set(bookings.map((b) => b.id));
      for (const id of Array.from(sent24h))
        if (!activeIds.has(id)) sent24h.delete(id);
      for (const id of Array.from(sent1h))
        if (!activeIds.has(id)) sent1h.delete(id);
    }
  } catch (err) {
    console.error("[reminders] tick failed:", err);
  }
}

export function startReminderScheduler() {
  setTimeout(tick, 5_000);
  setInterval(tick, TICK_MS);
}
