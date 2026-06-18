import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeftRight, X } from "lucide-react";
import { useStudentPaymentStatus } from "./booking-payment-badges";
import { isMembershipBookingBlocked } from "@shared/membership-grace";
import {
  shouldShowMembershipBadge,
  type PaymentBadgeStudent,
} from "@/lib/utils-gym";
import {
  MEMBERSHIP_CANCEL_BLOCK_MESSAGE,
  MEMBERSHIP_RESCHEDULE_BLOCK_MESSAGE,
} from "@shared/membership-booking";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Props = {
  bookingId: string;
  studentId: string;
  student: PaymentBadgeStudent;
  dateStr: string;
  personName: string;
  cancelDeadlineH: number;
  tooLateToCancel: boolean;
  onReschedule: () => void;
  onCancel: () => void;
};

export function StudentBookingRowActions({
  bookingId,
  studentId,
  student,
  dateStr,
  personName,
  cancelDeadlineH,
  tooLateToCancel,
  onReschedule,
  onCancel,
}: Props) {
  const { toast } = useToast();
  const checkMembership = shouldShowMembershipBadge(student);
  const { data: paymentStatus } = useStudentPaymentStatus(
    checkMembership ? studentId : undefined,
    dateStr,
    checkMembership,
  );
  const blockedByMembership =
    checkMembership &&
    isMembershipBookingBlocked(paymentStatus);

  const rescheduleHardDisabled = tooLateToCancel && !blockedByMembership;
  const cancelHardDisabled = tooLateToCancel && !blockedByMembership;

  const rescheduleTitle = blockedByMembership
    ? MEMBERSHIP_RESCHEDULE_BLOCK_MESSAGE
    : tooLateToCancel
      ? `Перенос закрыт менее чем за ${cancelDeadlineH} ч.`
      : "Перенести запись";

  const cancelTitle = blockedByMembership
    ? MEMBERSHIP_CANCEL_BLOCK_MESSAGE
    : tooLateToCancel
      ? `Отмена закрыта менее чем за ${cancelDeadlineH} ч.`
      : "Отменить запись";

  const handleRescheduleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (blockedByMembership) {
      toast({ variant: "destructive", description: MEMBERSHIP_RESCHEDULE_BLOCK_MESSAGE });
      return;
    }
    if (tooLateToCancel) return;
    onReschedule();
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (blockedByMembership) {
      toast({ variant: "destructive", description: MEMBERSHIP_CANCEL_BLOCK_MESSAGE });
      return;
    }
    if (tooLateToCancel) return;
    onCancel();
  };

  const actionButtonClass = (blocked: boolean) =>
    cn(blocked && "opacity-50 cursor-not-allowed");

  return (
    <>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRescheduleClick}
              disabled={rescheduleHardDisabled}
              aria-disabled={blockedByMembership || tooLateToCancel}
              className={cn(
                "h-6 w-6 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30",
                actionButtonClass(blockedByMembership),
              )}
              title={rescheduleTitle}
              aria-label={`Перенести запись: ${personName}`}
              data-testid={`button-reschedule-${bookingId}`}
            >
              <ArrowLeftRight className="h-3 w-3" />
            </Button>
          </span>
        </TooltipTrigger>
        {blockedByMembership && (
          <TooltipContent side="top" className="max-w-xs z-[100]">
            {MEMBERSHIP_RESCHEDULE_BLOCK_MESSAGE}
          </TooltipContent>
        )}
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelClick}
              disabled={cancelHardDisabled}
              aria-disabled={blockedByMembership || tooLateToCancel}
              className={cn(
                "h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30",
                actionButtonClass(blockedByMembership),
              )}
              title={cancelTitle}
              aria-label={`Отменить запись: ${personName}`}
              data-testid={`button-cancel-${bookingId}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </span>
        </TooltipTrigger>
        {blockedByMembership && (
          <TooltipContent side="top" className="max-w-xs z-[100]">
            {MEMBERSHIP_CANCEL_BLOCK_MESSAGE}
          </TooltipContent>
        )}
      </Tooltip>
    </>
  );
}
