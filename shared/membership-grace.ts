import type { StudentPaymentStatus } from "./schema";

/** Days after CV due date when booking is still allowed without new payment. */
export const MEMBERSHIP_GRACE_DAYS = 3;

export function membershipGraceWarningMessage(daysLeft: number): string {
  if (daysLeft <= 1) {
    return "Членский взнос не оплачен. Завтра запись будет заблокирована. Свяжитесь с тренером.";
  }
  return `Членский взнос не оплачен. Через ${daysLeft} дн. запись будет заблокирована. Свяжитесь с тренером.`;
}

export function isMembershipBookingBlocked(
  status: StudentPaymentStatus | undefined,
): boolean {
  return status !== undefined && !status.membershipBookingAllowed;
}

export function getMembershipGraceWarning(
  status: StudentPaymentStatus | undefined,
): string | null {
  if (!status?.membershipInGrace || status.membershipGraceDaysLeft == null) {
    return null;
  }
  return membershipGraceWarningMessage(status.membershipGraceDaysLeft);
}
