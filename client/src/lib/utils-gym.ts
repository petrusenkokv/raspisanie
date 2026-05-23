import type { WeeklyTemplate } from "@shared/schema";

export function isoWeekdayFromDateStr(dateStr: string): number {
  const w = new Date(`${dateStr}T12:00:00`).getDay();
  return w === 0 ? 7 : w;
}

/** Whether this calendar day is a working day in the weekly template (Mon=1 … Sun=7). */
export function isWorkingDayByTemplate(
  dateStr: string,
  template: WeeklyTemplate | undefined,
): boolean {
  if (!template) return true;
  const entry = template[String(isoWeekdayFromDateStr(dateStr)) as "1"];
  return !!(entry && entry.enabled);
}

/** Whether a time slot falls inside working hours for that date per the weekly template. */
export function isSlotInWorkingHours(
  time: string,
  dateStr: string,
  template: WeeklyTemplate | undefined,
): boolean {
  if (!template || !isWorkingDayByTemplate(dateStr, template)) return false;
  const hour = parseInt(time.slice(0, 2), 10);
  if (Number.isNaN(hour)) return false;
  const entry = template[String(isoWeekdayFromDateStr(dateStr)) as "1"];
  if (!entry?.enabled) return false;
  if (hour < entry.startHour || hour >= entry.endHour) return false;
  if (entry.breakStartHour != null && entry.breakEndHour != null) {
    if (hour >= entry.breakStartHour && hour < entry.breakEndHour) return false;
  }
  return true;
}

export function calculateAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export function todayLocalStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}
