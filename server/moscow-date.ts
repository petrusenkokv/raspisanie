/** Calendar date YYYY-MM-DD in Europe/Moscow (UTC+3, no DST). */
export function moscowDateString(d: Date = new Date()): string {
  return new Date(d.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as 00:00 in Europe/Moscow. */
export function parseMoscowDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+03:00`);
}

/** Add N calendar months to YYYY-MM-DD (timezone-independent). */
export function addMonthsToDateStr(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const monthIndex = m - 1 + months;
  const ny = y + Math.floor(monthIndex / 12);
  const nm = ((monthIndex % 12) + 12) % 12 + 1;
  const maxDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, maxDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Add N calendar days anchored at Moscow midnight. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const t = parseMoscowDate(dateStr).getTime() + days * 86_400_000;
  return moscowDateString(new Date(t));
}

/**
 * Last inclusive day of a monthly_cv period for dateStr, or null if outside coverage.
 * Period is [paidDate, endExclusive) where endExclusive = paidDate + 1 month + sickDayCount.
 */
export function cvValidUntilForDate(
  paidDateStr: string,
  dateStr: string,
  sickDayCount: number,
): string | null {
  if (dateStr < paidDateStr) return null;
  let endExclusive = addMonthsToDateStr(paidDateStr, 1);
  if (sickDayCount > 0) {
    endExclusive = addDaysToDateStr(endExclusive, sickDayCount);
  }
  if (dateStr >= endExclusive) return null;
  return addDaysToDateStr(endExclusive, -1);
}

/** Earliest calendar date when the next monthly_cv mark is allowed. */
export function nextCvAllowedDateStr(paidDateStr: string, sickDayCount: number): string {
  let endExclusive = addMonthsToDateStr(paidDateStr, 1);
  if (sickDayCount > 0) {
    endExclusive = addDaysToDateStr(endExclusive, sickDayCount);
  }
  return endExclusive;
}

/** Collect each YYYY-MM-DD from startStr through endStr inclusive. */
export function eachDateStrInRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  let cur = startStr;
  while (cur <= endStr) {
    out.push(cur);
    cur = addDaysToDateStr(cur, 1);
  }
  return out;
}
