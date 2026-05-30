import type { TimeSlotWithBookings } from "@shared/schema";

export type StudentSlotAvailability = "blocked" | "full" | "available";

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
