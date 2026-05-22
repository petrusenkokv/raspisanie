/** Calendar date YYYY-MM-DD in Europe/Moscow (UTC+3, no DST). */
export function moscowDateString(d: Date = new Date()): string {
  return new Date(d.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
}
