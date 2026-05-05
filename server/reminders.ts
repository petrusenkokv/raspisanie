import { storage } from "./storage-instance";

const sent24h = new Set<string>();
const sent1h = new Set<string>();
// Дедупликация дополнительных напоминаний (общая настройка тренера для всех учеников).
// Ключ: `${bookingId}:custom:${reminderMinutes}`.
const sentCustom = new Set<string>();
// Дедупликация напоминаний об окончании ЧВ.
// Ключ вида `${studentId}:${cvValidUntil}:${bucket}`, где bucket = "3d" | "1d" | "0d".
const sentCvExpiry = new Set<string>();
// Дедупликация напоминаний об абонементе к тренеру.
// Ключи: `${subscriptionId}:1left` и `${subscriptionId}:done`.
const sentTrainerSub = new Set<string>();
// Дедупликация напоминаний о ДР ученика.
// Ключ вида `${studentId}:${YYYY}:${bucket}` — bucket = "7d" | "1d" | "0d".
const sentBirthday = new Set<string>();

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

// Разница в календарных днях между двумя датами в формате YYYY-MM-DD.
// Положительное число — to позже from.
function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00Z");
  const to = new Date(toStr + "T00:00:00Z");
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatDateHuman(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
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
  const [y, m, d] = date.split("-");
  return `${d}-${m}-${y} в ${time}`;
}

// Проверка окончания ЧВ: за 3 дня, за 1 день, в день окончания.
async function checkCvExpiry(now: Date) {
  const todayStr = moscowDateString(now);
  const students = await storage.getStudentsList(false);
  for (const student of students) {
    let status;
    try {
      status = await storage.getStudentPaymentStatus(student.id, todayStr);
    } catch {
      continue;
    }
    if (
      !status ||
      status.membershipKind !== "monthly_cv" ||
      !status.cvValidUntil
    ) {
      continue;
    }

    const daysLeft = daysBetween(todayStr, status.cvValidUntil);
    let bucket: "3d" | "1d" | "0d" | null = null;
    let title = "";
    let message = "";
    const validUntilHuman = formatDateHuman(status.cvValidUntil);

    if (daysLeft === 3) {
      bucket = "3d";
      title = "Скоро заканчивается ЧВ";
      message = `Через 3 дня (${validUntilHuman}) заканчивается срок оплаты членского взноса. Не забудьте оплатить.`;
    } else if (daysLeft === 1) {
      bucket = "1d";
      title = "Завтра заканчивается ЧВ";
      message = `Завтра (${validUntilHuman}) заканчивается срок оплаты членского взноса. Не забудьте оплатить.`;
    } else if (daysLeft === 0) {
      bucket = "0d";
      title = "Сегодня заканчивается ЧВ";
      message = `Сегодня последний день действия членского взноса. Пожалуйста, внесите оплату.`;
    } else {
      continue;
    }

    const key = `${student.id}:${status.cvValidUntil}:${bucket}`;
    if (sentCvExpiry.has(key)) continue;
    await storage.createNotification({
      userId: student.id,
      type: "cv_expiry_reminder",
      title,
      message,
    });
    sentCvExpiry.add(key);
  }

  // Очистка устаревших ключей (когда период давно истёк).
  if (sentCvExpiry.size > 5000) {
    for (const key of Array.from(sentCvExpiry)) {
      const validUntil = key.split(":")[1];
      if (validUntil && validUntil < todayStr) sentCvExpiry.delete(key);
    }
  }
}

// Проверка абонементов к тренеру: остался последний сеанс или абонемент израсходован.
async function checkTrainerSubscriptions() {
  const students = await storage.getStudentsList(false);
  for (const student of students) {
    let subs;
    try {
      subs = await storage.getTrainerPayments(student.id);
    } catch {
      continue;
    }
    if (!subs || subs.length === 0) continue;

    for (const sub of subs) {
      const remaining = Math.max(0, sub.totalSessions - sub.usedSessions);

      // Абонемент закончился (израсходованы все сеансы).
      if (sub.status === "completed" || (sub.status === "active" && remaining === 0)) {
        const key = `${sub.id}:done`;
        if (!sentTrainerSub.has(key)) {
          await storage.createNotification({
            userId: student.id,
            type: "trainer_subscription_reminder",
            title: "Абонемент к тренеру закончился",
            message: `Все сеансы из абонемента (${sub.totalSessions}) использованы. Не забудьте оплатить новый абонемент.`,
          });
          sentTrainerSub.add(key);
        }
        continue;
      }

      // Остался последний сеанс — предупреждение.
      if (sub.status === "active" && remaining === 1) {
        const key = `${sub.id}:1left`;
        if (!sentTrainerSub.has(key)) {
          await storage.createNotification({
            userId: student.id,
            type: "trainer_subscription_reminder",
            title: "Осталась последняя тренировка",
            message: `В абонементе к тренеру осталась 1 тренировка из ${sub.totalSessions}. Не забудьте оплатить новый абонемент.`,
          });
          sentTrainerSub.add(key);
        }
      }
    }
  }
}

// Дни до ближайшей годовщины ДР относительно текущей даты по Москве.
// Возвращает целое число дней (≥ 0). Для 29 февраля в невисокосный год — 28 февраля.
function daysUntilBirthday(birthDateStr: string, todayStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateStr);
  if (!m) return null;
  const bMonth = parseInt(m[2], 10);
  const bDay = parseInt(m[3], 10);
  if (!bMonth || !bDay) return null;

  const [ty, tm, td] = todayStr.split("-").map((s) => parseInt(s, 10));
  const todayUtc = Date.UTC(ty, tm - 1, td);

  function bdInYear(year: number): number {
    let day = bDay;
    let month = bMonth;
    // Високосный 29 февраля → переносим на 28 февраля в обычные годы.
    if (month === 2 && day === 29) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      if (!isLeap) day = 28;
    }
    return Date.UTC(year, month - 1, day);
  }

  let bd = bdInYear(ty);
  if (bd < todayUtc) bd = bdInYear(ty + 1);
  return Math.round((bd - todayUtc) / 86400000);
}

async function checkStudentBirthdays(now: Date) {
  const trainer = await storage.getTrainer();
  if (!trainer) return;
  const todayStr = moscowDateString(now);
  const todayYear = todayStr.slice(0, 4);
  const students = await storage.getStudentsList(false);

  for (const student of students) {
    if (!student.birthDate) continue;
    const daysLeft = daysUntilBirthday(student.birthDate, todayStr);
    if (daysLeft == null) continue;

    let bucket: "7d" | "1d" | "0d" | null = null;
    let title = "";
    let message = "";
    const fio = [student.lastName, student.firstName].filter(Boolean).join(" ").trim() || student.firstName || "ученика";

    if (daysLeft === 7) {
      bucket = "7d";
      title = "Через неделю день рождения";
      message = `Через 7 дней день рождения у ${fio}.`;
    } else if (daysLeft === 1) {
      bucket = "1d";
      title = "Завтра день рождения";
      message = `Завтра день рождения у ${fio}.`;
    } else if (daysLeft === 0) {
      bucket = "0d";
      title = "Сегодня день рождения";
      message = `Сегодня день рождения у ${fio}. Не забудьте поздравить!`;
    } else {
      continue;
    }

    const key = `${student.id}:${todayYear}:${bucket}`;
    if (sentBirthday.has(key)) continue;
    await storage.createNotification({
      userId: trainer.id,
      type: "birthday_reminder",
      title,
      message,
    });
    sentBirthday.add(key);
  }

  // Очистка устаревших ключей за прошлые годы.
  if (sentBirthday.size > 5000) {
    for (const key of Array.from(sentBirthday)) {
      const year = key.split(":")[1];
      if (year && year < todayYear) sentBirthday.delete(key);
    }
  }
}

async function tick() {
  try {
    const bookings = await storage.listActiveBookings();
    const now = Date.now();
    const settings = await storage.getTrainerSettings();
    const reminderMinutes = settings.reminderMinutes;

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

      // Если общая настройка тренера = 60 минут, стандартное напоминание «за час»
      // дублирует пользовательское — пропускаем его.
      if (reminderMinutes !== 60 && minutesUntil > 0 && minutesUntil <= 60 && !sent1h.has(booking.id)) {
        await storage.createNotification({
          userId: booking.studentId,
          type: "training_reminder",
          title: "Тренировка через час",
          message: `Через час у вас тренировка: ${when}`,
          relatedBookingId: booking.id,
        });
        sent1h.add(booking.id);
      }

      // Дополнительное напоминание (общая настройка тренера для всех учеников).
      const m = reminderMinutes;
      if (m && m > 0) {
        const customKey = `${booking.id}:custom:${m}`;
        // Срабатываем когда minutesUntil попадает в [m-1, m] — небольшой допуск под тик в 60с.
        if (minutesUntil <= m && minutesUntil >= m - 1 && !sentCustom.has(customKey)) {
          const minutesText =
            m % 60 === 0
              ? `${m / 60} ${m / 60 === 1 ? "час" : "ч."}`
              : `${m} минут`;
          await storage.createNotification({
            userId: booking.studentId,
            type: "training_reminder",
            title: `Тренировка через ${minutesText}`,
            message: `Через ${minutesText} у вас тренировка: ${when}`,
            relatedBookingId: booking.id,
          });
          sentCustom.add(customKey);
        }
      }
    }

    if (sent24h.size > 5000 || sent1h.size > 5000 || sentCustom.size > 5000) {
      const activeIds = new Set(bookings.map((b) => b.id));
      for (const id of Array.from(sent24h))
        if (!activeIds.has(id)) sent24h.delete(id);
      for (const id of Array.from(sent1h))
        if (!activeIds.has(id)) sent1h.delete(id);
      for (const key of Array.from(sentCustom)) {
        const bookingId = key.split(":")[0];
        if (!activeIds.has(bookingId)) sentCustom.delete(key);
      }
    }

    await checkCvExpiry(new Date(now));
    await checkTrainerSubscriptions();
    await checkStudentBirthdays(new Date(now));
  } catch (err) {
    console.error("[reminders] tick failed:", err);
  }
}

export function startReminderScheduler() {
  setTimeout(tick, 5_000);
  setInterval(tick, TICK_MS);
}
