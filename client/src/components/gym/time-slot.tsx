import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, Users, UserCheck, LogIn, UserPlus, X, Check, Lock, Unlock, Pencil, RotateCcw, CircleSlash, Heart, AlarmClock, ArrowLeftRight, Repeat } from "lucide-react";
import { RescheduleDialog } from "./reschedule-dialog";
import { Input } from "@/components/ui/input";
import { type TimeSlotWithBookings, type AttendanceStatus, type StudentPaymentStatus } from "@shared/schema";
import { Wallet, Dumbbell } from "lucide-react";
import { useGymStore } from "@/store/gym-store";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmedBookingHint } from "./confirmed-booking-hint";
import { BookingSourceBadge } from "./booking-source-badge";
import { SlotSessionPrice } from "./slot-session-price";
import { CalendarCellHint, type CalendarCellHintLevel } from "./calendar-cell-hint";
import { useTrainerBookingCancel } from "./trainer-cancel-booking";
import { useStudentBookingCancel } from "./student-cancel-booking";
import {
  formatStudentShortName,
  shouldShowMembershipBadge,
  shouldShowTrainerPaymentBadge,
} from "@/lib/utils-gym";
import {
  dayCardStudentBookedClasses,
  dayCardStudentFillClasses,
  getStudentSlotFillLevel,
} from "@/lib/slot-availability-ui";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ru } from "date-fns/locale";
import { getBlockedSlotLabel } from "@shared/block-display";
import { BlockNoteDialog } from "./block-note-dialog";

function minutesUntilSlotMoscow(date: string, time: string): number {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  const ms = new Date(`${date}T${t}:00+03:00`).getTime();
  if (isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Math.round((ms - Date.now()) / 60_000);
}

interface TimeSlotProps {
  timeSlot: TimeSlotWithBookings;
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string, message?: string) => void;
  onConfirm: (bookingId: string) => void;
  onLoginRequest: (mode?: "login" | "register") => void;
  onTrainerBook?: (timeSlotId: string) => void;
  familyStudentIds?: string[];
}

export function TimeSlot({ timeSlot, onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook, familyStudentIds = [] }: TimeSlotProps) {
  const { currentUser, isTrainer } = useGymStore();
  const { toast } = useToast();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [rescheduleBooking, setRescheduleBooking] = useState<{
    id: string; studentId: string;
  } | null>(null);
  const { requestCancel: requestTrainerCancel, dialog: trainerCancelDialog } =
    useTrainerBookingCancel(onCancel);
  const { requestCancel: requestStudentCancel, dialog: studentCancelDialog } =
    useStudentBookingCancel(onCancel);

  const { data: scheduleSettings } = useQuery<{
    bookingDeadlineHours?: number;
    cancelDeadlineHours?: number;
  }>({
    queryKey: ["/api/schedule/settings"],
    staleTime: 60_000,
  });
  const bookingDeadlineH = scheduleSettings?.bookingDeadlineHours ?? 0;
  const cancelDeadlineH = scheduleSettings?.cancelDeadlineHours ?? 0;
  const minutesUntil = minutesUntilSlotMoscow(timeSlot.date, timeSlot.time);
  const tooLateToBook =
    !isTrainer() && bookingDeadlineH > 0 && minutesUntil <= bookingDeadlineH * 60;
  const tooLateToCancel =
    !isTrainer() && cancelDeadlineH > 0 && minutesUntil <= cancelDeadlineH * 60;

  const showFamilyRowActions =
    !!currentUser && !isTrainer() && !(currentUser as any).isPendingApproval;

  const [blockNoteDialogOpen, setBlockNoteDialogOpen] = useState(false);

  const blockMutation = useMutation({
    mutationFn: async (vars: { blocked: boolean; blockNote?: string | null }) => {
      const r = await apiRequest("PATCH", `/api/trainer/time-slots/${timeSlot.id}/block`, vars);
      return r.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setBlockNoteDialogOpen(false);
      toast({
        title: vars.blocked ? "Слот заблокирован" : "Слот открыт",
        description: vars.blocked && data.cancelledCount > 0
          ? `Отменено записей: ${data.cancelledCount}`
          : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const [capPopoverOpen, setCapPopoverOpen] = useState(false);
  const [capInput, setCapInput] = useState<number>(timeSlot.maxCapacity);
  const isManualCap = (timeSlot as any).isManualCapacity as boolean | undefined;

  const capacityMutation = useMutation({
    mutationFn: async (capacity: number | null) => {
      const r = await apiRequest("PATCH", `/api/trainer/time-slots/${timeSlot.id}/capacity`, { capacity });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setCapPopoverOpen(false);
      toast({ title: "Количество мест обновлено" });
    },
    onError: (e: any) =>
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: AttendanceStatus | null }) => {
      const r = await apiRequest("PATCH", `/api/trainer/bookings/${bookingId}/attendance`, {
        status,
      });
      return r.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["payment-status"] });
      toast({
        title: vars.status === null ? "Отметка снята" : "Посещаемость отмечена",
      });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  // Attendance marks available from slot start (Moscow time)
  const slotStarted = minutesUntil <= 0;

  const isFull = timeSlot.availableSpots === 0;
  const isBlocked = timeSlot.isBlocked;
  const blockReason = timeSlot.blockReason;
  const blockNote = timeSlot.blockNote;
  const blockedLabel = getBlockedSlotLabel(blockReason, blockNote);

  const bookingStudentIds =
    familyStudentIds.length > 0
      ? familyStudentIds
      : currentUser?.id
        ? [currentUser.id]
        : [];
  const isParentUser = currentUser?.role === "parent" || !!(currentUser as any)?.isParent;
  const familyBookings = timeSlot.bookings.filter(
    (booking) =>
      booking.status !== "cancelled" && bookingStudentIds.includes(booking.studentId),
  );
  const userBooking =
    familyBookings.find((booking) => booking.studentId === currentUser?.id) ??
    familyBookings[0];
  const bookedPersonName = userBooking
    ? formatStudentShortName(userBooking.student)
    : "";
  const isBookingForCurrentUser = !!userBooking && userBooking.studentId === currentUser?.id;
  const familyBookedNames = familyBookings
    .map((b) => formatStudentShortName(b.student))
    .filter(Boolean);
  const bookingOwnerTitle = !userBooking
    ? ""
    : isBookingForCurrentUser
      ? "Вы записаны!"
      : `Записан ребёнок: ${bookedPersonName}`;
  const bookingOwnerSubtitle = !userBooking
    ? ""
    : isBookingForCurrentUser
      ? "Тренер подтвердил запись"
      : "Запись оформлена с вашего аккаунта";

  const confirmedBookings = timeSlot.bookings.filter(b => b.status === "confirmed");
  const pendingBookings = timeSlot.bookings.filter(b => b.status === "pending");
  const allActiveBookings = [...confirmedBookings, ...pendingBookings];

  const getSlotStatus = () => {
    if (isBlocked) return "blocked";
    if (isFull) return "full";
    if (isTrainer()) {
      if (timeSlot.availableSpots === 1) return "almost-full";
      return "available";
    }
    return "available";
  };

  const statusStyles = {
    blocked: "bg-gray-200 dark:bg-gray-700 border-gray-300",
    full: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    "almost-full": "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
    available: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  };

  const status = getSlotStatus();
  const isGuest = !currentUser;

  const slotPriceStudentIds = useMemo(() => {
    if (!currentUser || isTrainer()) return [] as string[];
    if (familyBookings.length > 0) {
      return Array.from(new Set(familyBookings.map((b) => b.studentId)));
    }
    if (familyStudentIds.length > 0) return familyStudentIds;
    return currentUser.id ? [currentUser.id] : [];
  }, [currentUser, isTrainer, familyBookings, familyStudentIds]);
  const studentFillLevel = getStudentSlotFillLevel(
    isBlocked,
    isFull,
    allActiveBookings.length,
  );
  const dayHintLevel: CalendarCellHintLevel = (() => {
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
  })();
  const cardStatusStyle = (() => {
    if (isTrainer()) return statusStyles[status];
    if (isBlocked) return dayCardStudentFillClasses.blocked;
    if (familyBookings.length > 0) return dayCardStudentBookedClasses;
    if (isGuest) {
      if (isFull) return dayCardStudentFillClasses.full;
      if (allActiveBookings.length > 0) return dayCardStudentFillClasses.partial;
      return dayCardStudentFillClasses.empty;
    }
    return dayCardStudentFillClasses[studentFillLevel];
  })();

  const handleCardClick = () => {
    if (!currentUser && !isBlocked && !isFull) {
      setPopoverOpen(true);
    }
  };

  const handleLoginClick = (mode?: "login" | "register") => {
    setPopoverOpen(false);
    onLoginRequest(mode);
  };

  const cardContent = (
    <Card
      className={cn(
        "p-4 transition-all duration-200 hover:shadow-md",
        !currentUser && !isBlocked && !isFull && "cursor-pointer",
        cardStatusStyle,
      )}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          <span className="font-semibold text-gray-900 dark:text-white">
            {timeSlot.time}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isTrainer() ? (
            <Badge
              variant={status === "available" ? "default" : "secondary"}
              className="text-xs notranslate"
            >
              {status === "blocked"
                ? blockedLabel
                : status === "full"
                  ? "Занято"
                  : status === "almost-full"
                    ? "Почти полно"
                    : "Свободно"}
            </Badge>
          ) : (
            <CalendarCellHint fillLevel={dayHintLevel} layout="day" />
          )}

          {!isBlocked && isTrainer() && (
            <Popover open={capPopoverOpen} onOpenChange={(o) => {
              setCapPopoverOpen(o);
              if (o) setCapInput(timeSlot.maxCapacity);
            }}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "flex items-center gap-1 text-sm rounded px-1.5 py-0.5 hover:bg-gray-200/60 dark:hover:bg-gray-700/60",
                    isManualCap
                      ? "text-blue-700 dark:text-blue-300 font-medium"
                      : "text-gray-600 dark:text-gray-400"
                  )}
                  title={isManualCap ? "Особое количество мест для этого слота" : "Изменить количество мест"}
                  data-testid={`button-edit-capacity-${timeSlot.id}`}
                >
                  <Users className="h-3 w-3" />
                  <span>{confirmedBookings.length}/{timeSlot.maxCapacity}</span>
                  <Pencil className="h-3 w-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" side="top" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Места на {timeSlot.time}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Записано: {confirmedBookings.length}. Минимум — это число.
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={Math.max(1, confirmedBookings.length)}
                    max={50}
                    value={capInput}
                    onChange={(e) => setCapInput(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    data-testid={`input-slot-capacity-${timeSlot.id}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={capacityMutation.isPending}
                      onClick={() => capacityMutation.mutate(capInput)}
                      data-testid={`button-save-capacity-${timeSlot.id}`}
                    >
                      Сохранить
                    </Button>
                    {isManualCap && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={capacityMutation.isPending}
                        onClick={() => capacityMutation.mutate(null)}
                        title="Вернуть к значению из шаблона"
                        data-testid={`button-reset-capacity-${timeSlot.id}`}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {isBlocked && (
        <div className="mb-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-800/60 px-3 py-2">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{blockedLabel}</p>
        </div>
      )}

      {/* Booking Info */}
      {!isBlocked && (
        <div className="space-y-2 mb-3">
          {isTrainer() ? (
            // Trainer view — show each student with cancel button
            <div className="space-y-2">
              {allActiveBookings.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Нет записей</p>
              )}
              {allActiveBookings.map((booking) => {
                const att = (booking as any).attendanceStatus as AttendanceStatus | null | undefined;
                const showAttendance = slotStarted && booking.status === "confirmed";
                return (
                  <div
                    key={booking.id}
                    className={`rounded px-2 py-1 space-y-1 ${
                      booking.status === "pending"
                        ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                        : "bg-white dark:bg-gray-900"
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm min-w-0 flex-wrap">
                        {booking.status === "pending" && (
                          <Clock className="h-3 w-3 text-yellow-600 shrink-0" />
                        )}
                        <span className="text-gray-900 dark:text-white truncate">
                          {formatStudentShortName(booking.student)}
                        </span>
                        {att ? (
                          <AttendanceBadge status={att} />
                        ) : booking.status === "confirmed" ? (
                          <ConfirmedBookingHint iconClassName="h-3 w-3" />
                        ) : (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            Заявка
                          </Badge>
                        )}
                        {isTrainer() && booking.bookingSource && (
                          <BookingSourceBadge source={booking.bookingSource} />
                        )}
                        {!isTrainer() && booking.recurringBookingId && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex shrink-0 text-muted-foreground"
                                aria-label="Повторяющаяся запись"
                              >
                                <Repeat className="h-3 w-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[220px]">
                              Запись из правила повторяющихся тренировок. Отмена — только на этот день.
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {booking.status === "confirmed" && (
                          <BookingPaymentBadges
                            studentId={booking.studentId}
                            dateStr={timeSlot.date}
                            showMembership={shouldShowMembershipBadge(booking.student)}
                            showTrainerPayment={shouldShowTrainerPaymentBadge(booking.student)}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {booking.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onConfirm(booking.id)}
                            className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Подтвердить запись"
                            data-testid={`button-trainer-confirm-${booking.id}`}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        {!showAttendance && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRescheduleBooking({ id: booking.id, studentId: booking.studentId })}
                            className="h-6 w-6 p-0 text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                            title="Перенести запись"
                            data-testid={`button-trainer-reschedule-${booking.id}`}
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            requestTrainerCancel({
                              bookingId: booking.id,
                              studentName: `${booking.student.firstName} ${booking.student.lastName ?? ""}`.trim(),
                              slotDate: timeSlot.date,
                              slotTime: timeSlot.time,
                              isPast: showAttendance,
                              isRecurring: !!booking.recurringBookingId,
                            })
                          }
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          title={showAttendance ? "Удалить прошедшую запись" : "Удалить запись"}
                          data-testid={`button-trainer-cancel-${booking.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {showAttendance && (
                      <div className="flex flex-nowrap gap-0.5 md:flex-wrap md:gap-1 pt-1 border-t border-gray-100 dark:border-gray-800">
                        <AttendanceButton
                          label="Пришёл"
                          icon={<UserCheck className="h-3 w-3" />}
                          color="green"
                          active={att === "attended"}
                          onClick={() => attendanceMutation.mutate({
                            bookingId: booking.id,
                            status: att === "attended" ? null : "attended",
                          })}
                          disabled={attendanceMutation.isPending}
                          testId={`button-attend-${booking.id}`}
                        />
                        <AttendanceButton
                          label="Опоздал"
                          icon={<AlarmClock className="h-3 w-3" />}
                          color="yellow"
                          active={att === "late"}
                          onClick={() => attendanceMutation.mutate({
                            bookingId: booking.id,
                            status: att === "late" ? null : "late",
                          })}
                          disabled={attendanceMutation.isPending}
                          testId={`button-late-${booking.id}`}
                        />
                        <AttendanceButton
                          label="Уваж."
                          icon={<Heart className="h-3 w-3" />}
                          color="blue"
                          active={att === "excused"}
                          onClick={() => attendanceMutation.mutate({
                            bookingId: booking.id,
                            status: att === "excused" ? null : "excused",
                          })}
                          disabled={attendanceMutation.isPending}
                          testId={`button-excused-${booking.id}`}
                        />
                        <AttendanceButton
                          label="Прогул"
                          icon={<CircleSlash className="h-3 w-3" />}
                          color="red"
                          active={att === "no_show"}
                          onClick={() => attendanceMutation.mutate({
                            bookingId: booking.id,
                            status: att === "no_show" ? null : "no_show",
                          })}
                          disabled={attendanceMutation.isPending}
                          testId={`button-noshow-${booking.id}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Student view
            <div className="space-y-2">
              {familyBookings.length > 0 ? (
                <div className="space-y-1.5">
                  {familyBookings.map((booking) => {
                    const personName = formatStudentShortName(booking.student);
                    const isPending = booking.status === "pending";
                    return (
                      <div
                        key={booking.id}
                        className={cn(
                          "rounded px-2 py-1.5 border flex flex-wrap items-center gap-x-1.5 gap-y-1",
                          "bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700",
                        )}
                      >
                        <span className="text-sm font-medium truncate text-gray-900 dark:text-white shrink-0 max-w-[45%] sm:max-w-none">
                          {personName}
                        </span>
                        {isPending ? (
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex shrink-0 cursor-help"
                                tabIndex={0}
                                aria-label="Ожидаем подтверждения тренера"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <Clock className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-400" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="z-[100]">
                              Ожидаем подтверждения тренера
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <ConfirmedBookingHint iconClassName="h-3 w-3" />
                        )}
                        <SlotSessionPrice studentIds={[booking.studentId]} inline />
                        <BookingPaymentBadges
                          studentId={booking.studentId}
                          dateStr={timeSlot.date}
                          showMembership={shouldShowMembershipBadge(booking.student)}
                          showTrainerPayment={shouldShowTrainerPaymentBadge(booking.student)}
                        />
                        {showFamilyRowActions && (
                          <>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRescheduleBooking({
                                    id: booking.id,
                                    studentId: booking.studentId,
                                  });
                                }}
                                disabled={tooLateToCancel}
                                className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                                title={
                                  tooLateToCancel
                                    ? `Перенос закрыт менее чем за ${cancelDeadlineH} ч.`
                                    : "Перенести запись"
                                }
                                aria-label={`Перенести запись: ${personName}`}
                                data-testid={`button-reschedule-${booking.id}`}
                              >
                                <ArrowLeftRight className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestStudentCancel({
                                    bookingId: booking.id,
                                    personName,
                                  });
                                }}
                                disabled={tooLateToCancel}
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                                title={
                                  tooLateToCancel
                                    ? `Отмена закрыта менее чем за ${cancelDeadlineH} ч.`
                                    : "Отменить запись"
                                }
                                aria-label={`Отменить запись: ${personName}`}
                                data-testid={`button-cancel-${booking.id}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                familyBookings.length === 0 && !isFull && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 sr-only">
                    Можно записаться
                  </p>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Trainer: Add student + block buttons */}
      {isTrainer() && !isBlocked && (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          {!isFull && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              onClick={() => onTrainerBook?.(timeSlot.id)}
              data-testid={`button-trainer-add-${timeSlot.id}`}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Записать ученика
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-gray-600 hover:bg-gray-100"
            onClick={() => setBlockNoteDialogOpen(true)}
            disabled={blockMutation.isPending}
            data-testid={`button-block-${timeSlot.id}`}
          >
            <Lock className="h-3 w-3 mr-1" />
            Заблокировать слот
          </Button>
        </div>
      )}

      {/* Student: own booking actions */}
      {!isBlocked && currentUser && !isTrainer() && (currentUser as any).isPendingApproval && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          Ожидает одобрения тренера
        </div>
      )}

      {!isBlocked && currentUser && !isTrainer() && !(currentUser as any).isPendingApproval && (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          {!isFull && slotPriceStudentIds.length > 0 && familyBookings.length === 0 && (
            <SlotSessionPrice studentIds={slotPriceStudentIds} />
          )}
          <div className="flex gap-2">
          {userBooking ? (
            isParentUser && !isFull ? (
              <Button
                size="sm"
                onClick={() => onBook(timeSlot.id)}
                data-testid={`button-parent-book-more-${timeSlot.id}`}
                className="w-full"
              >
                Записать ещё
              </Button>
            ) : null
          ) : (
            !isFull && (
              <Button
                onClick={() => onBook(timeSlot.id)}
                className="flex-1"
                size="sm"
                disabled={tooLateToBook}
                title={tooLateToBook ? `Запись закрыта менее чем за ${bookingDeadlineH} ч.` : undefined}
                data-testid={`button-book-${timeSlot.id}`}
              >
                {tooLateToBook ? "Запись закрыта" : "Записаться"}
              </Button>
            )
          )}
          </div>
        </div>
      )}

      {isBlocked && isTrainer() && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={(e) => { e.stopPropagation(); blockMutation.mutate({ blocked: false }); }}
          disabled={blockMutation.isPending}
          data-testid={`button-unblock-${timeSlot.id}`}
        >
          <Unlock className="h-3 w-3 mr-1" />
          Разблокировать
        </Button>
      )}
    </Card>
  );

  // Wrap with Popover only for guest users on available slots
  if (!currentUser && !isBlocked && !isFull) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          {cardContent}
        </PopoverTrigger>
        <PopoverContent className="w-72 p-4" side="top">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-blue-600" />
              <p className="font-semibold text-gray-900 dark:text-white">
                Нужен вход в систему
              </p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Чтобы записаться на <strong>{timeSlot.time}</strong>, войдите или зарегистрируйтесь.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => handleLoginClick("login")} className="w-full" size="sm">
                <LogIn className="mr-2 h-4 w-4" />
                Войти
              </Button>
              <Button onClick={() => handleLoginClick("register")} variant="outline" className="w-full" size="sm">
                <UserPlus className="mr-2 h-4 w-4" />
                Зарегистрироваться
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      {cardContent}
      {rescheduleBooking && (
        <RescheduleDialog
          open={!!rescheduleBooking}
          onOpenChange={(open) => { if (!open) setRescheduleBooking(null); }}
          bookingId={rescheduleBooking.id}
          studentId={rescheduleBooking.studentId}
          currentDate={timeSlot.date}
          currentTime={timeSlot.time}
        />
      )}
      {trainerCancelDialog}
      {studentCancelDialog}
      <BlockNoteDialog
        open={blockNoteDialogOpen}
        onOpenChange={setBlockNoteDialogOpen}
        title="Заблокировать слот"
        description={`Время ${timeSlot.time}. Существующие записи будут отменены.`}
        confirmLabel="Заблокировать"
        pending={blockMutation.isPending}
        onConfirm={(note) => blockMutation.mutate({ blocked: true, blockNote: note })}
      />
    </>
  );
}

const ATTENDANCE_BADGE: Record<AttendanceStatus, { label: string; className: string }> = {
  attended: { label: "Пришёл", className: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800" },
  late: { label: "Опоздал", className: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800" },
  excused: { label: "Уваж.", className: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" },
  no_show: { label: "Прогул", className: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" },
};

function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const { label, className } = ATTENDANCE_BADGE[status];
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${className}`}>
      {label}
    </span>
  );
}

function AttendanceButton({
  label,
  icon,
  color,
  active,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  color: "green" | "yellow" | "blue" | "red";
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const colors: Record<string, string> = {
    green: active
      ? "bg-green-600 text-white border-green-600"
      : "text-green-700 border-green-300 hover:bg-green-50 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900/30",
    yellow: active
      ? "bg-yellow-500 text-white border-yellow-500"
      : "text-yellow-700 border-yellow-300 hover:bg-yellow-50 dark:text-yellow-300 dark:border-yellow-800 dark:hover:bg-yellow-900/30",
    blue: active
      ? "bg-blue-600 text-white border-blue-600"
      : "text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/30",
    red: active
      ? "bg-red-600 text-white border-red-600"
      : "text-red-600 border-red-300 hover:bg-red-50 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/30",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center gap-1 text-[11px] font-medium h-7 w-7 p-0 md:h-auto md:w-auto md:px-1.5 md:py-0.5 rounded border transition disabled:opacity-50 shrink-0 ${colors[color]}`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}


function BookingPaymentBadges({
  studentId,
  dateStr,
  showMembership = true,
  showTrainerPayment = true,
}: {
  studentId: string;
  dateStr: string;
  showMembership?: boolean;
  showTrainerPayment?: boolean;
}) {
  const showAny = showMembership || showTrainerPayment;
  const { isTrainer } = useGymStore();
  const paymentStatusUrl = isTrainer()
    ? `/api/trainer/students/${studentId}/payment-status?date=${encodeURIComponent(dateStr)}`
    : `/api/student/payment-status/${studentId}?date=${encodeURIComponent(dateStr)}`;

  const { data, isLoading, isError } = useQuery<StudentPaymentStatus>({
    queryKey: ["payment-status", studentId, dateStr, isTrainer() ? "trainer" : "student"],
    queryFn: async () => {
      const r = await apiRequest("GET", paymentStatusUrl);
      return r.json();
    },
    staleTime: 30_000,
    retry: 2,
    enabled: Boolean(studentId && dateStr && showAny),
  });

  if (!showAny) return null;

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0" aria-hidden>
        <span className="h-5 w-9 rounded border border-gray-200 bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <span className="h-5 w-9 rounded border border-gray-200 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </span>
    );
  }

  if (isError || !data) {
    return (
      <span
        className="inline-flex items-center gap-1 shrink-0 text-[10px] text-gray-500"
        title="Не удалось загрузить статус оплаты"
      >
        <span className="px-1 py-0.5 rounded border border-gray-300 bg-gray-50 dark:bg-gray-800">ЧВ ?</span>
        <span className="px-1 py-0.5 rounded border border-gray-300 bg-gray-50 dark:bg-gray-800">Тр ?</span>
      </span>
    );
  }

  const cvOk = data.hasMembership;
  const cvLabel = data.membershipKind === "monthly_cv" ? "ЧВ" : data.membershipKind === "one_time_bv" ? "БВ" : "ЧВ";
  const trainerOk = data.hasTrainerPayment;
  const trainerLabel = data.activeTrainerPayment
    ? `${Math.max(0, data.activeTrainerPayment.totalSessions - data.activeTrainerPayment.usedSessions)}/${data.activeTrainerPayment.totalSessions}`
    : "—";

  // Подробное содержимое подсказки для значка ЧВ/БВ.
  let cvTooltipNode: React.ReactNode;
  // Сколько дней осталось до окончания ЧВ (для подсветки "скоро истекает").
  let cvDaysLeft: number | null = null;
  if (cvOk && data.membershipKind === "monthly_cv" && data.cvPaidDate && data.cvValidUntil) {
    const paid = parseISO(data.cvPaidDate);
    const validUntil = parseISO(data.cvValidUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.max(0, differenceInCalendarDays(validUntil, today));
    cvDaysLeft = daysLeft;
    cvTooltipNode = (
      <div className="space-y-1 text-xs">
        <div className="font-semibold">ЧВ оплачен</div>
        <div>Оплата: {format(paid, "d MMMM yyyy", { locale: ru })}</div>
        <div>Действует до: {format(validUntil, "d MMMM yyyy", { locale: ru })} вкл.</div>
        <div className={daysLeft <= 3 ? "text-orange-300 font-medium" : "text-gray-300 dark:text-gray-400"}>
          Осталось дней: {daysLeft}
          {daysLeft <= 3 && " — скоро нужна оплата"}
        </div>
      </div>
    );
  } else if (cvOk && data.membershipKind === "one_time_bv" && data.cvPaidDate) {
    cvTooltipNode = (
      <div className="space-y-1 text-xs">
        <div className="font-semibold">БВ оплачен</div>
        <div>Дата: {format(parseISO(data.cvPaidDate), "d MMMM yyyy", { locale: ru })}</div>
        <div className="text-gray-300 dark:text-gray-400">Разовая оплата на этот день</div>
      </div>
    );
  } else if (cvOk) {
    cvTooltipNode = <span className="text-xs">ЧВ/БВ оплачено</span>;
  } else {
    cvTooltipNode = <span className="text-xs">ЧВ/БВ не оплачено</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {showMembership && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border cursor-help ${
                !cvOk
                  ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                  : cvDaysLeft !== null && cvDaysLeft <= 3
                  ? "bg-orange-100 text-orange-700 border-orange-400 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                  : "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
              }`}
              data-testid={`badge-payment-cv-${studentId}`}
            >
              <Wallet className="h-2.5 w-2.5" />
              {cvOk ? (
                <>
                  {cvLabel}
                  {cvDaysLeft !== null && cvDaysLeft <= 3 && (
                    <span className="ml-0.5">·{cvDaysLeft}д</span>
                  )}
                </>
              ) : (
                "ЧВ ✗"
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">{cvTooltipNode}</TooltipContent>
        </Tooltip>
      )}
      {showTrainerPayment && (
        <span
          className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border ${
            trainerOk
              ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
              : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
          }`}
          title={trainerOk ? "Оплата тренеру есть" : "Нет оплаты тренеру"}
          data-testid={`badge-payment-trainer-${studentId}`}
        >
          <Dumbbell className="h-2.5 w-2.5" />
          {trainerOk ? trainerLabel : "✗"}
        </span>
      )}
    </span>
  );
}
