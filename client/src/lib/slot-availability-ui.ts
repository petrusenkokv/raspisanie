import type { TimeSlotWithBookings } from "@shared/schema";

export type StudentSlotAvailability = "blocked" | "full" | "available";

export type StudentSlotFillLevel = "blocked" | "empty" | "partial" | "full";

export function getStudentSlotFillLevel(
  isBlocked: boolean,
  isFull: boolean,
  occupiedCount: number,
): StudentSlotFillLevel {
  if (isBlocked) return "blocked";
  if (isFull) return "full";
  if (occupiedCount > 0) return "partial";
  return "empty";
}

export function getStudentSlotAvailability(
  isBlocked: boolean,
  isFull: boolean,
): StudentSlotAvailability {
  if (isBlocked) return "blocked";
  if (isFull) return "full";
  return "available";
}

export function studentSlotBadgeText(
  status: StudentSlotAvailability,
  blockedLabel?: string,
): string {
  if (status === "blocked") return blockedLabel ?? "Заблокировано";
  if (status === "full") return "Занято";
  return "Можно";
}

export function studentAvailabilityHint(isFull: boolean): string {
  return isFull ? "Все занято" : "Можно записаться";
}

export function guestWeekCellLabel(isFull: boolean): string {
  return isFull ? "Занято" : "Можно";
}

export type MonthDayFillLevel = "booked" | "empty" | "partial" | "full";

export function getMonthDayStudentFillLevel(
  openSlots: TimeSlotWithBookings[],
  familyStudentIds: string[],
): MonthDayFillLevel {
  const hasFamilyBooking = openSlots.some((ts) =>
    ts.bookings.some(
      (b) =>
        (b.status === "confirmed" || b.status === "pending") &&
        familyStudentIds.includes(b.studentId),
    ),
  );
  if (hasFamilyBooking) return "booked";
  const hasAvailable = openSlots.some((ts) => ts.availableSpots > 0);
  if (!hasAvailable) return "full";
  const totalBooked = openSlots.reduce(
    (sum, ts) =>
      sum +
      ts.bookings.filter((b) => b.status === "confirmed" || b.status === "pending").length,
    0,
  );
  if (totalBooked === 0) return "empty";
  return "partial";
}

export function getMonthDayGuestFillLevel(
  openSlots: TimeSlotWithBookings[],
): "empty" | "full" {
  const hasAvailable = openSlots.some((ts) => ts.availableSpots > 0);
  return hasAvailable ? "empty" : "full";
}

/** Month grid: цвет ячейки без текста (ученик / родитель). */
export const monthCellStudentFillClasses: Record<MonthDayFillLevel, string> = {
  booked:
    "bg-blue-50 dark:bg-blue-900/30 ring-1 ring-inset ring-blue-300 dark:ring-blue-700 hover:bg-blue-100/80 dark:hover:bg-blue-900/40",
  empty:
    "bg-green-50 dark:bg-green-900/25 ring-1 ring-inset ring-green-200 dark:ring-green-800 hover:bg-green-100 dark:hover:bg-green-900/40",
  partial:
    "bg-amber-50 dark:bg-amber-900/25 ring-1 ring-inset ring-amber-300 dark:ring-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40",
  full: "bg-red-50 dark:bg-red-900/20 ring-1 ring-inset ring-red-200 dark:ring-red-800 hover:bg-red-100/80 dark:hover:bg-red-900/30",
};

/** Month grid: гость — только зелёный / красный. */
export const monthCellGuestFillClasses: Record<"empty" | "full", string> = {
  empty: monthCellStudentFillClasses.empty,
  full: monthCellStudentFillClasses.full,
};

export function monthDayGuestLabel(openSlots: TimeSlotWithBookings[]): string {
  if (openSlots.length === 0) return "";
  const hasAvailable = openSlots.some((ts) => ts.availableSpots > 0);
  return hasAvailable ? "Записаться" : "Занято";
}

export function monthDayGuestTooltip(openSlots: TimeSlotWithBookings[]): string {
  if (openSlots.length === 0) return "";
  const hasAvailable = openSlots.some((ts) => ts.availableSpots > 0);
  return hasAvailable ? "Можно записаться" : "Все занято";
}

export function getMonthFamilyBookingTimes(
  openSlots: TimeSlotWithBookings[],
  familyStudentIds: string[],
  max = 2,
): string[] {
  const times: string[] = [];
  for (const ts of openSlots) {
    const hasBooking = ts.bookings.some(
      (b) =>
        (b.status === "confirmed" || b.status === "pending") &&
        familyStudentIds.includes(b.studentId),
    );
    if (hasBooking) times.push(ts.time.slice(0, 5));
  }
  return Array.from(new Set(times)).sort().slice(0, max);
}

export function getMonthOpenSlotTimesPreview(
  openSlots: TimeSlotWithBookings[],
  max = 3,
): string[] {
  return openSlots
    .filter((ts) => ts.availableSpots > 0)
    .map((ts) => ts.time.slice(0, 5))
    .sort()
    .slice(0, max);
}

export function monthDayStudentHint(fill: MonthDayFillLevel): {
  shortLabel: string;
  labelClass: string;
  timeClass: string;
} {
  switch (fill) {
    case "booked":
      return {
        shortLabel: "Ваша запись",
        labelClass: "text-blue-700 dark:text-blue-300",
        timeClass: "text-blue-800 dark:text-blue-200",
      };
    case "empty":
      return {
        shortLabel: "Записаться",
        labelClass: "text-green-700 dark:text-green-300",
        timeClass: "text-green-800 dark:text-green-200",
      };
    case "partial":
      return {
        shortLabel: "Мало мест",
        labelClass: "text-amber-800 dark:text-amber-300",
        timeClass: "text-amber-900 dark:text-amber-200",
      };
    case "full":
      return {
        shortLabel: "Занято",
        labelClass: "text-red-600 dark:text-red-400",
        timeClass: "",
      };
  }
}

export function monthDayGuestHint(fill: "guest-empty" | "guest-full"): {
  shortLabel: string;
  labelClass: string;
  timeClass: string;
} {
  if (fill === "guest-full") {
    return {
      shortLabel: "Занято",
      labelClass: "text-red-600 dark:text-red-400",
      timeClass: "",
    };
  }
  return {
    shortLabel: "Записаться",
    labelClass: "text-green-700 dark:text-green-300",
    timeClass: "text-green-800 dark:text-green-200",
  };
}

export function monthDayStudentLabel(
  openSlots: TimeSlotWithBookings[],
  familyStudentIds: string[],
): string {
  if (openSlots.length === 0) return "";
  const hasFamilyBooking = openSlots.some((ts) =>
    ts.bookings.some(
      (b) =>
        (b.status === "confirmed" || b.status === "pending") &&
        familyStudentIds.includes(b.studentId),
    ),
  );
  if (hasFamilyBooking) return "ваша запись";
  const hasAvailable = openSlots.some((ts) => ts.availableSpots > 0);
  return hasAvailable ? "можно записаться" : "все занято";
}

export function monthDayStudentTooltip(
  openSlots: TimeSlotWithBookings[],
  familyStudentIds: string[],
): string {
  if (openSlots.length === 0) return "";
  const hasFamilyBooking = openSlots.some((ts) =>
    ts.bookings.some(
      (b) =>
        (b.status === "confirmed" || b.status === "pending") &&
        familyStudentIds.includes(b.studentId),
    ),
  );
  if (hasFamilyBooking) return "На этот день есть ваша запись";
  const hasAvailable = openSlots.some((ts) => ts.availableSpots > 0);
  return hasAvailable ? "Можно записаться" : "Все занято";
}

/** Week grid: ученик — зелёный / оранжевый / красный по загрузке (без цифр). */
export const weekCellStudentFillClasses: Record<StudentSlotFillLevel, string> = {
  blocked: "bg-gray-200 dark:bg-gray-700 text-gray-400",
  empty:
    "bg-green-50 dark:bg-green-900/25 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 ring-1 ring-inset ring-green-200 dark:ring-green-800",
  partial:
    "bg-amber-50 dark:bg-amber-900/25 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 ring-1 ring-inset ring-amber-300 dark:ring-amber-700",
  full: "bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-300",
};

/** Week grid: гость — зелёный «Можно», красный «Занято». */
export const weekCellGuestAvailableClasses = weekCellStudentFillClasses.empty;
export const weekCellGuestFullClasses = weekCellStudentFillClasses.full;

/** Day cards: те же уровни, что и в неделе. */
export const dayCardStudentFillClasses: Record<StudentSlotFillLevel, string> = {
  blocked: "bg-gray-200 dark:bg-gray-700 border-gray-300",
  empty: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  partial: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
  full: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
};

export const dayCardGuestNeutralClasses =
  "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700";
