import { MEMBERSHIP_GRACE_DAYS } from "@shared/membership-grace";
import { addDaysToDateStr, addMonthsToDateStr } from "./moscow-date";

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

export type MembershipGraceFields = {
  membershipBookingAllowed: boolean;
  membershipInGrace: boolean;
  membershipBlockDate: string | null;
  membershipGraceDaysLeft: number | null;
};

const daysBetween = (fromStr: string, toStr: string): number => {
  const from = new Date(`${fromStr}T00:00:00+03:00`).getTime();
  const to = new Date(`${toStr}T00:00:00+03:00`).getTime();
  return Math.round((to - from) / 86_400_000);
};

export function computeMembershipGraceFields(
  todayStr: string,
  exemptMembership: boolean,
  hasMembershipToday: boolean,
  latestCvPeriodEnd: string | null,
): MembershipGraceFields {
  const ok: MembershipGraceFields = {
    membershipBookingAllowed: true,
    membershipInGrace: false,
    membershipBlockDate: null,
    membershipGraceDaysLeft: null,
  };

  if (exemptMembership || hasMembershipToday) return ok;
  if (!latestCvPeriodEnd) {
    return {
      membershipBookingAllowed: false,
      membershipInGrace: false,
      membershipBlockDate: null,
      membershipGraceDaysLeft: null,
    };
  }

  const paymentDueDate = addDaysToDateStr(latestCvPeriodEnd, 1);
  const blockDate = addDaysToDateStr(paymentDueDate, MEMBERSHIP_GRACE_DAYS);

  if (todayStr < paymentDueDate) return ok;
  if (todayStr >= blockDate) {
    return {
      membershipBookingAllowed: false,
      membershipInGrace: false,
      membershipBlockDate: blockDate,
      membershipGraceDaysLeft: 0,
    };
  }

  return {
    membershipBookingAllowed: true,
    membershipInGrace: true,
    membershipBlockDate: blockDate,
    membershipGraceDaysLeft: daysBetween(todayStr, blockDate),
  };
}
