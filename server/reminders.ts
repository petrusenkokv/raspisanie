import { storage } from "./storage-instance";
import { moscowDateString } from "./moscow-date";
import { pushNotifyUser } from "./push-notify-user";

const sent24h = new Set<string>();
const sent1h = new Set<string>();
// Дедупликация дополнительных напоминаний (общая настройка тренера для всех учеников).
// Ключ: `${bookingId}:custom:${reminderMinutes}`.
const sentCustom = new Set<string>();
// Напоминания тренеру о предстоящих слотах (по timeSlotId).
const sentTrainer24h = new Set<string>();
const sentTrainer1h = new Set<string>();
const sentTrainerCustom = new Set<string>();
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

function formatStudentShortName(firstName: string, lastName?: string | null): string {
  const lastInitial = lastName?.trim()?.[0];
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
}

async function formatStudentNames(studentIds: string[]): Promise<string> {
  const names: string[] = [];
  for (const id of studentIds) {
    const user = await storage.getUser(id);
    if (!user) continue;
    names.push(formatStudentShortName(user.firstName, user.lastName));
  }
  return names.length > 0 ? names.join(", ") : "нет записей";
}

const REMINDER_WINDOW_MINUTES = {
  day: 20 * 60,
  hour: 90,
  custom: 10,
} as const;

async function createTrainingReminder(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedBookingId: string | null;
  memoryKey: string;
  memorySet: Set<string>;
  window: keyof typeof REMINDER_WINDOW_MINUTES;
}): Promise<void> {
  if (params.memorySet.has(params.memoryKey)) return;
  const already = await storage.wasReminderSentRecently(
    params.userId,
    params.type,
    params.title,
    params.relatedBookingId,
    REMINDER_WINDOW_MINUTES[params.window],
  );
  if (already) {
    params.memorySet.add(params.memoryKey);
    return;
  }
  await storage.createNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    relatedBookingId: params.relatedBookingId,
  });

  await pushNotifyUser(params.userId, params.title, params.message, {
    tag: `${params.type}:${params.memoryKey}`,
    url: "/",
  });

  params.memorySet.add(params.memoryKey);
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
      message = `Сегодня последний день действия членского взноса. Оплатите в течение 3 дней, иначе запись будет заблокирована.`;
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

async function notifyTrainerUpcomingSlots(
  bookings: Awaited<ReturnType<typeof storage.listActiveBookings>>,
  now: number,
  reminderMinutes: number | null,
) {
  const trainer = await storage.getTrainer();
  if (!trainer) return;

  const slotMap = new Map<
    string,
    { slotDate: string; slotTime: string; studentIds: string[]; firstBookingId: string }
  >();

  for (const booking of bookings) {
    if (booking.status !== "confirmed") continue;
    const slot = await storage.getTimeSlotById(booking.timeSlotId);
    if (!slot || slot.isBlocked) continue;
    const existing = slotMap.get(slot.id);
    if (existing) {
      if (!existing.studentIds.includes(booking.studentId)) {
        existing.studentIds.push(booking.studentId);
      }
      continue;
    }
    slotMap.set(slot.id, {
      slotDate: slot.date,
      slotTime: slot.time.slice(0, 5),
      studentIds: [booking.studentId],
      firstBookingId: booking.id,
    });
  }

  for (const [slotId, group] of Array.from(slotMap.entries())) {
    const start = slotStartTime(group.slotDate, group.slotTime);
    if (!start) continue;

    const minutesUntil = Math.round((start.getTime() - now) / 60_000);
    if (minutesUntil <= 0) continue;

    const when = formatHuman(group.slotDate, group.slotTime);
    const prefix = dayPrefix(group.slotDate, new Date(now));
    const timeOnly = group.slotTime;
    const students = await formatStudentNames(group.studentIds);

    if (minutesUntil > 60 && minutesUntil <= 1440) {
      const message =
        prefix === "today"
          ? `Сегодня в ${timeOnly} — ${students}`
          : prefix === "tomorrow"
            ? `Завтра в ${timeOnly} — ${students}`
            : `Скоро тренировка: ${when} — ${students}`;
      await createTrainingReminder({
        userId: trainer.id,
        type: "trainer_training_reminder",
        title: "Напоминание о тренировке",
        message,
        relatedBookingId: group.firstBookingId,
        memoryKey: slotId,
        memorySet: sentTrainer24h,
        window: "day",
      });
    }

    if (reminderMinutes !== 60 && minutesUntil > 0 && minutesUntil <= 60) {
      await createTrainingReminder({
        userId: trainer.id,
        type: "trainer_training_reminder",
        title: "Тренировка через час",
        message: `Через час тренировка: ${when} — ${students}`,
        relatedBookingId: group.firstBookingId,
        memoryKey: slotId,
        memorySet: sentTrainer1h,
        window: "hour",
      });
    }

    const m = reminderMinutes;
    if (m && m > 0) {
      const customKey = `${slotId}:custom:${m}`;
      if (minutesUntil <= m && minutesUntil >= m - 1) {
        const minutesText =
          m % 60 === 0
            ? `${m / 60} ${m / 60 === 1 ? "час" : "ч."}`
            : `${m} минут`;
        await createTrainingReminder({
          userId: trainer.id,
          type: "trainer_training_reminder",
          title: `Тренировка через ${minutesText}`,
          message: `Через ${minutesText} тренировка: ${when} — ${students}`,
          relatedBookingId: group.firstBookingId,
          memoryKey: customKey,
          memorySet: sentTrainerCustom,
          window: "custom",
        });
      }
    }
  }

  if (sentTrainer24h.size > 5000 || sentTrainer1h.size > 5000 || sentTrainerCustom.size > 5000) {
    const activeSlotIds = new Set(
      Array.from(slotMap.keys()).filter((slotId) => {
        const group = slotMap.get(slotId);
        if (!group) return false;
        const start = slotStartTime(group.slotDate, group.slotTime);
        if (!start) return false;
        return start.getTime() > now;
      }),
    );
    for (const id of Array.from(sentTrainer24h)) {
      if (!activeSlotIds.has(id)) sentTrainer24h.delete(id);
    }
    for (const id of Array.from(sentTrainer1h)) {
      if (!activeSlotIds.has(id)) sentTrainer1h.delete(id);
    }
    for (const key of Array.from(sentTrainerCustom)) {
      const slotId = key.split(":")[0];
      if (!activeSlotIds.has(slotId)) sentTrainerCustom.delete(key);
    }
  }
}

async function tick() {
  try {
    const bookings = await storage.listActiveBookings();
    const now = Date.now();
    const settings = await storage.getTrainerSettings();
    const reminderMinutes = settings.reminderMinutes;

    await notifyTrainerUpcomingSlots(bookings, now, reminderMinutes);

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

      if (minutesUntil > 60 && minutesUntil <= 1440) {
        const message =
          prefix === "today"
            ? `Сегодня у вас тренировка в ${timeOnly}`
            : prefix === "tomorrow"
            ? `Завтра у вас тренировка в ${timeOnly}`
            : `Скоро тренировка: ${when}`;
        await createTrainingReminder({
          userId: booking.studentId,
          type: "training_reminder",
          title: "Напоминание о тренировке",
          message,
          relatedBookingId: booking.id,
          memoryKey: booking.id,
          memorySet: sent24h,
          window: "day",
        });
      }

      // Если общая настройка тренера = 60 минут, стандартное напоминание «за час»
      // дублирует пользовательское — пропускаем его.
      if (reminderMinutes !== 60 && minutesUntil > 0 && minutesUntil <= 60) {
        await createTrainingReminder({
          userId: booking.studentId,
          type: "training_reminder",
          title: "Тренировка через час",
          message: `Через час у вас тренировка: ${when}`,
          relatedBookingId: booking.id,
          memoryKey: booking.id,
          memorySet: sent1h,
          window: "hour",
        });
      }

      // Дополнительное напоминание (общая настройка тренера для всех учеников).
      const m = reminderMinutes;
      if (m && m > 0) {
        const customKey = `${booking.id}:custom:${m}`;
        // Срабатываем когда minutesUntil попадает в [m-1, m] — небольшой допуск под тик в 60с.
        if (minutesUntil <= m && minutesUntil >= m - 1) {
          const minutesText =
            m % 60 === 0
              ? `${m / 60} ${m / 60 === 1 ? "час" : "ч."}`
              : `${m} минут`;
          await createTrainingReminder({
            userId: booking.studentId,
            type: "training_reminder",
            title: `Тренировка через ${minutesText}`,
            message: `Через ${minutesText} у вас тренировка: ${when}`,
            relatedBookingId: booking.id,
            memoryKey: customKey,
            memorySet: sentCustom,
            window: "custom",
          });
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

export async function runRemindersTick(): Promise<void> {
  await tick();
}

export function startReminderScheduler() {
  setTimeout(tick, 5_000);
  setInterval(tick, TICK_MS);
}
