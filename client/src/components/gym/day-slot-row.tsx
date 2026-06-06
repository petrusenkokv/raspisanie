import { useMemo, useState } from "react";
import { ChevronRight, Check, Clock } from "lucide-react";
import { useGymStore } from "@/store/gym-store";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { TimeSlotWithBookings } from "@shared/schema";
import { getBlockedSlotLabel } from "@shared/block-display";
import {
  formatStudentShortName,
  shouldShowMembershipBadge,
} from "@/lib/utils-gym";
import {
  dayCardStudentBookedClasses,
  dayCardStudentFillClasses,
  getStudentSlotFillLevel,
} from "@/lib/slot-availability-ui";
import { CalendarCellHint, type CalendarCellHintLevel } from "./calendar-cell-hint";
import { SlotSessionPrice } from "./slot-session-price";
import { BookingPaymentBadges, useStudentPaymentStatus } from "./booking-payment-badges";
import { TimeSlot } from "./time-slot";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function minutesUntilSlotMoscow(date: string, time: string): number {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  const ms = new Date(`${date}T${t}:00+03:00`).getTime();
  if (isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Math.round((ms - Date.now()) / 60_000);
}

type Props = {
  timeSlot: TimeSlotWithBookings;
  familyStudentIds?: string[];
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string, message?: string) => void;
  onConfirm: (bookingId: string) => void;
  onLoginRequest: (mode?: "login" | "register") => void;
  onTrainerBook?: (timeSlotId: string) => void;
};

export function DaySlotRow({
  timeSlot,
  familyStudentIds = [],
  onBook,
  onCancel,
  onConfirm,
  onLoginRequest,
  onTrainerBook,
}: Props) {
  const [open, setOpen] = useState(false);
  const { currentUser, isTrainer } = useGymStore();

  const { data: scheduleSettings } = useQuery<{
    bookingDeadlineHours?: number;
  }>({
    queryKey: ["/api/schedule/settings"],
    staleTime: 60_000,
  });
  const bookingDeadlineH = scheduleSettings?.bookingDeadlineHours ?? 0;
  const minutesUntil = minutesUntilSlotMoscow(timeSlot.date, timeSlot.time);
  const tooLateToBook =
    !isTrainer() && bookingDeadlineH > 0 && minutesUntil <= bookingDeadlineH * 60;

  const confirmedBookings = timeSlot.bookings.filter((b) => b.status === "confirmed");
  const pendingBookings = timeSlot.bookings.filter((b) => b.status === "pending");
  const allActiveBookings = [...confirmedBookings, ...pendingBookings];

  const bookingStudentIds =
    familyStudentIds.length > 0
      ? familyStudentIds
      : currentUser?.id
        ? [currentUser.id]
        : [];
  const familyBookings = timeSlot.bookings.filter(
    (b) => b.status !== "cancelled" && bookingStudentIds.includes(b.studentId),
  );
  const userBooking = familyBookings[0];
  const isBlocked = timeSlot.isBlocked;
  const isFull = timeSlot.availableSpots === 0;
  const blockedLabel = getBlockedSlotLabel(timeSlot.blockReason, timeSlot.blockNote);
  const isGuest = !currentUser && !isTrainer();

  const showSelfMembershipBadge =
    !!currentUser &&
    !isTrainer() &&
    currentUser.role === "student" &&
    shouldShowMembershipBadge(currentUser);
  const { data: selfPaymentStatus } = useStudentPaymentStatus(
    showSelfMembershipBadge ? currentUser?.id : undefined,
    timeSlot.date,
    showSelfMembershipBadge,
  );
  const blockedByMembership =
    showSelfMembershipBadge &&
    selfPaymentStatus !== undefined &&
    !selfPaymentStatus.hasMembership;

  const fillLevel = getStudentSlotFillLevel(isBlocked, isFull, allActiveBookings.length);
  const hintLevel: CalendarCellHintLevel = useMemo(() => {
    if (isBlocked) return "blocked";
    if (familyBookings.length > 0) return "booked";
    if (isGuest) {
      if (isFull) return "guest-full";
      if (allActiveBookings.length > 0) return "partial";
      return "guest-empty";
    }
    if (isFull) return "full";
    if (allActiveBookings.length > 0) return "partial";
    return "empty";
  }, [isBlocked, familyBookings.length, isGuest, isFull, allActiveBookings.length]);

  const rowClass = (() => {
    if (isTrainer()) {
      if (isBlocked) return dayCardStudentFillClasses.blocked;
      if (isFull) return dayCardStudentFillClasses.full;
      if (allActiveBookings.length > 0) {
        return "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700";
      }
      return dayCardStudentFillClasses.empty;
    }
    if (isBlocked) return dayCardStudentFillClasses.blocked;
    if (familyBookings.length > 0) return dayCardStudentBookedClasses;
    return dayCardStudentFillClasses[fillLevel];
  })();

  const summary = (() => {
    if (isBlocked) return blockedLabel;
    if (isTrainer()) {
      if (allActiveBookings.length === 0) return "Нет записей";
      const names = allActiveBookings
        .slice(0, 2)
        .map((b) => formatStudentShortName(b.student))
        .join(", ");
      const extra = allActiveBookings.length > 2 ? ` +${allActiveBookings.length - 2}` : "";
      return `${confirmedBookings.length}/${timeSlot.maxCapacity} · ${names}${extra}`;
    }
    if (familyBookings.length > 0) {
      const name = formatStudentShortName(userBooking!.student);
      return userBooking!.status === "pending" ? `${name} · заявка` : `${name} · записаны`;
    }
    if (isFull) return "Занято";
    if (tooLateToBook) return "Запись закрыта";
    if (blockedByMembership) return "Нет ЧВ · записаться";
    if (isGuest) return "Войти и записаться";
    return "Записаться";
  })();

  const timeLabel = timeSlot.time.length >= 5 ? timeSlot.time.slice(0, 5) : timeSlot.time;
  const priceStudentIds =
    familyBookings.length > 0
      ? familyBookings.map((b) => b.studentId)
      : bookingStudentIds;

  const handleBook = (id: string) => {
    onBook(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          "w-full flex items-center gap-2 min-h-[44px] px-2.5 py-1.5 rounded-lg border text-left transition-colors active:opacity-90",
          rowClass,
        )}
        onClick={() => setOpen(true)}
        aria-label={`${timeLabel}, ${summary}`}
        data-testid={`day-slot-row-${timeSlot.id}`}
      >
        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white shrink-0 w-[3.25rem]">
          {timeLabel}
        </span>
        <span className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          {familyBookings.length > 0 && userBooking?.status === "confirmed" && (
            <Check className="h-3.5 w-3.5 text-green-600 shrink-0" aria-hidden />
          )}
          {familyBookings.length > 0 && userBooking?.status === "pending" && (
            <Clock className="h-3.5 w-3.5 text-yellow-600 shrink-0" aria-hidden />
          )}
          <span className="text-xs text-gray-800 dark:text-gray-100 truncate">{summary}</span>
          {!isBlocked && priceStudentIds.length > 0 && (
            <SlotSessionPrice studentIds={priceStudentIds} inline />
          )}
          {familyBookings.length > 0 && userBooking && (
            <BookingPaymentBadges
              studentId={userBooking.studentId}
              dateStr={timeSlot.date}
              showMembership={shouldShowMembershipBadge(userBooking.student)}
              showTrainerPayment={false}
            />
          )}
        </span>
        <CalendarCellHint fillLevel={hintLevel} layout="week" />
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl px-4 pb-8 pt-4">
          <SheetHeader className="text-left pb-3 border-b mb-3">
            <SheetTitle className="text-lg tabular-nums">{timeLabel}</SheetTitle>
          </SheetHeader>
          <TimeSlot
            layout="embedded"
            timeSlot={timeSlot}
            familyStudentIds={familyStudentIds}
            onBook={handleBook}
            onCancel={onCancel}
            onConfirm={onConfirm}
            onLoginRequest={(mode) => {
              onLoginRequest(mode);
              setOpen(false);
            }}
            onTrainerBook={(id) => {
              onTrainerBook?.(id);
              setOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
