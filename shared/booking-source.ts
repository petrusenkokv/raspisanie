export type BookingSource = "recurring" | "trainer" | "student_self" | "parent";

export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  recurring: "Постоянная",
  trainer: "Тренер",
  student_self: "Сам",
  parent: "Родитель",
};

export const BOOKING_SOURCE_HINTS: Record<BookingSource, string> = {
  recurring: "Запись создана правилом повторяющихся тренировок",
  trainer: "Запись создана тренером",
  student_self: "Ученик записался сам",
  parent: "Запись создана родителем",
};

type BookedByUser = {
  id: string;
  role: string;
};

type BookingForSource = {
  studentId: string;
  recurringBookingId: string | null;
};

export const resolveBookingSource = (
  booking: BookingForSource,
  bookedByUser: BookedByUser | null | undefined,
): BookingSource => {
  if (booking.recurringBookingId) return "recurring";
  if (!bookedByUser) return "student_self";
  if (bookedByUser.role === "trainer") return "trainer";
  if (bookedByUser.id === booking.studentId) return "student_self";
  if (bookedByUser.role === "parent") return "parent";
  return "student_self";
};
