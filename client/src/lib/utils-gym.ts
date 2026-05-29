import type { WeeklyTemplate } from "@shared/schema";
import { calculateAgeYears } from "@shared/birth-date";

export {
  todayLocalStr,
  birthDateAgeSuffix,
  birthDateValidationError,
} from "@shared/birth-date";
export type { BirthDateValidationKind } from "@shared/birth-date";

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
  return calculateAgeYears(birthDate);
}

/** Подпись к блоку «Законные представители» в карточке ученика. */
export function legalRepresentativeSectionHint(age: number | null): string | null {
  if (age === null) return null;
  if (age < 14) return "до 14 лет — нужен законный представитель";
  if (age < 18) return "несовершеннолетний — контакт родителей";
  return null;
}

export function studentIsUnder18(age: number | null): boolean {
  return age !== null && age < 18;
}

export function studentNeedsLegalRepresentative(age: number | null): boolean {
  return age !== null && age < 14;
}

export type PaymentBadgeStudent = {
  id?: string;
  role?: string;
  exemptMembership?: boolean | null;
  exemptTrainerPayment?: boolean | null;
};

/** Скрыть отметки оплаты: тренер в слоте, своя запись, или флаги освобождения. */
export function shouldShowMembershipBadge(
  student: PaymentBadgeStudent,
  bookingStudentId?: string,
  viewerUserId?: string | null,
): boolean {
  if (bookingStudentId && viewerUserId && bookingStudentId === viewerUserId) return false;
  if (student.role === "trainer") return false;
  return student.exemptMembership !== true;
}

export function shouldShowTrainerPaymentBadge(
  student: PaymentBadgeStudent,
  bookingStudentId?: string,
  viewerUserId?: string | null,
): boolean {
  if (bookingStudentId && viewerUserId && bookingStudentId === viewerUserId) return false;
  if (student.role === "trainer") return false;
  return student.exemptTrainerPayment !== true;
}

export function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}
