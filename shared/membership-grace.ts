import type { StudentPaymentStatus } from "./schema";

/**
 * Нельзя записаться, если членский взнос просрочен на сегодня.
 * Пока ЧВ действителен (или ещё не наступил срок оплаты) — запись открыта,
 * в том числе на даты в будущем, на которые ЧВ ещё не распространяется.
 */
export function isMembershipBookingBlocked(
  status: StudentPaymentStatus | undefined,
): boolean {
  return status !== undefined && !status.membershipBookingAllowed;
}

/**
 * Нельзя отменить или перенести тренировку без оплаченного ЧВ на дату занятия.
 * Существующие записи сохраняются, но управлять ими ученик не может.
 */
export function isMembershipActionBlocked(
  status: StudentPaymentStatus | undefined,
): boolean {
  return status !== undefined && !status.hasMembership;
}
