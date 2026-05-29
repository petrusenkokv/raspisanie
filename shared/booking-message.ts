export const BOOKING_MESSAGE_MAX_LENGTH = 200;

export function sanitizeBookingMessage(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return trimmed.slice(0, BOOKING_MESSAGE_MAX_LENGTH);
}

export function appendBookingMessage(base: string, message?: string): string {
  if (!message) return base;
  return `${base} Комментарий: ${message}`;
}
