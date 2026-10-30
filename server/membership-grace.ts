import { addDaysToDateStr, addMonthsToDateStr } from "./moscow-date";

/**
 * Последний день действия ЧВ-периода (включительно), начатого с `paidDateStr`.
 * Период: [base, base + 1 месяц + дни больничных).
 */
export function cvPeriodValidUntilInclusive(
  paidDateStr: string,
  sickDayCount: number,
): string {
  let endExclusive = addMonthsToDateStr(paidDateStr, 1);
  if (sickDayCount > 0) {
    endExclusive = addDaysToDateStr(endExclusive, sickDayCount);
  }
  return addDaysToDateStr(endExclusive, -1);
}
