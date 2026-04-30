import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, Users, UserCheck, LogIn, UserPlus, X, Check, Lock, Unlock, Pencil, RotateCcw, CircleSlash, Heart, AlarmClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { type TimeSlotWithBookings, type AttendanceStatus, type StudentPaymentStatus } from "@shared/schema";
import { Wallet, Dumbbell } from "lucide-react";
import { useGymStore } from "@/store/gym-store";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ru } from "date-fns/locale";

function minutesUntilSlotMoscow(date: string, time: string): number {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  const ms = new Date(`${date}T${t}:00+03:00`).getTime();
  if (isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Math.round((ms - Date.now()) / 60_000);
}

interface TimeSlotProps {
  timeSlot: TimeSlotWithBookings;
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string) => void;
  onConfirm: (bookingId: string) => void;
  onLoginRequest: () => void;
  onTrainerBook?: (timeSlotId: string) => void;
}

export function TimeSlot({ timeSlot, onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook }: TimeSlotProps) {
  const { currentUser, isTrainer } = useGymStore();
  const { toast } = useToast();
  const [popoverOpen, setPopoverOpen] = useState(false);

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

  const blockMutation = useMutation({
    mutationFn: async (blocked: boolean) => {
      const r = await apiRequest("PATCH", `/api/trainer/time-slots/${timeSlot.id}/block`, { blocked });
      return r.json();
    },
    onSuccess: (data, blocked) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({
        title: blocked ? "Слот заблокирован" : "Слот открыт",
        description: blocked && data.cancelledCount > 0
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

  // A slot is considered "past" 1 hour after its start time (a typical lesson length)
  const isPast = minutesUntil < -60;

  const isFull = timeSlot.availableSpots === 0;
  const isBlocked = timeSlot.isBlocked;
  const blockReason = (timeSlot as any).blockReason as string | null | undefined;
  const blockedLabel =
    blockReason === "holiday" ? "Праздник" :
    blockReason === "template" ? "Не работает" :
    "Заблокировано";

  const userBooking = timeSlot.bookings.find(
    booking => booking.studentId === currentUser?.id && booking.status !== "cancelled"
  );

  const confirmedBookings = timeSlot.bookings.filter(b => b.status === "confirmed");
  const pendingBookings = timeSlot.bookings.filter(b => b.status === "pending");
  const allActiveBookings = [...confirmedBookings, ...pendingBookings];

  const getSlotStatus = () => {
    if (isBlocked) return "blocked";
    if (isFull) return "full";
    if (timeSlot.availableSpots === 1) return "almost-full";
    return "available";
  };

  const statusStyles = {
    blocked: "bg-gray-200 dark:bg-gray-700 border-gray-300",
    full: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    "almost-full": "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
    available: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
  };

  const status = getSlotStatus();

  const handleCardClick = () => {
    if (!currentUser && !isBlocked && !isFull) {
      setPopoverOpen(true);
    }
  };

  const handleLoginClick = () => {
    setPopoverOpen(false);
    onLoginRequest();
  };

  const cardContent = (
    <Card
      className={cn(
        "p-4 transition-all duration-200 hover:shadow-md",
        !currentUser && !isBlocked && !isFull && "cursor-pointer",
        statusStyles[status],
        userBooking && "ring-2 ring-blue-500"
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
          <Badge
            variant={status === "available" ? "default" : "secondary"}
            className="text-xs"
          >
            {status === "blocked" ? blockedLabel :
             status === "full" ? "Занято" :
             status === "almost-full" ? "Почти полно" : "Свободно"}
          </Badge>

          {!isBlocked && !isTrainer() && (
            <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
              <Users className="h-3 w-3" />
              <span>{confirmedBookings.length}/{timeSlot.maxCapacity}</span>
            </div>
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
                const showAttendance = isPast && booking.status === "confirmed";
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
                        {booking.status === "confirmed"
                          ? <UserCheck className="h-3 w-3 text-green-600 shrink-0" />
                          : <Clock className="h-3 w-3 text-yellow-600 shrink-0" />
                        }
                        <span className="text-gray-900 dark:text-white truncate">
                          {booking.student.firstName} {booking.student.lastName}
                        </span>
                        {att ? (
                          <AttendanceBadge status={att} />
                        ) : (
                          <Badge
                            variant={booking.status === "confirmed" ? "default" : "secondary"}
                            className="text-xs shrink-0"
                          >
                            {booking.status === "confirmed" ? "Записан" : "Заявка"}
                          </Badge>
                        )}
                        {booking.status === "confirmed" && (
                          <BookingPaymentBadges studentId={booking.studentId} dateStr={timeSlot.date} />
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
                            onClick={() => onCancel(booking.id)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Удалить запись"
                            data-testid={`button-trainer-cancel-${booking.id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {showAttendance && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-100 dark:border-gray-800">
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
              {userBooking ? (
                userBooking.status === "pending" ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md">
                    <Clock className="h-4 w-4 text-yellow-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Заявка подана тренеру</p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">Ожидайте подтверждения</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-md">
                    <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">Вы записаны!</p>
                      <p className="text-xs text-green-600 dark:text-green-400">Тренер подтвердил запись</p>
                    </div>
                  </div>
                )
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {timeSlot.availableSpots > 0
                    ? `Свободных мест: ${timeSlot.availableSpots}`
                    : "Мест не осталось"}
                </p>
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
            onClick={() => blockMutation.mutate(true)}
            disabled={blockMutation.isPending}
            data-testid={`button-block-${timeSlot.id}`}
          >
            <Lock className="h-3 w-3 mr-1" />
            Заблокировать слот
          </Button>
        </div>
      )}

      {/* Student: own booking actions */}
      {!isBlocked && currentUser && !isTrainer() && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {userBooking ? (
            <div className="flex gap-2 w-full">
              {userBooking.status === "pending" && (
                <Badge variant="secondary" className="flex-1 justify-center">
                  Ждет подтверждения
                </Badge>
              )}
              {userBooking.status === "confirmed" && (
                <Badge variant="default" className="flex-1 justify-center">
                  Записан
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(userBooking.id)}
                className="text-red-600 hover:text-red-700"
                disabled={tooLateToCancel}
                title={tooLateToCancel ? `Отмена закрыта менее чем за ${cancelDeadlineH} ч.` : undefined}
                data-testid={`button-cancel-${timeSlot.id}`}
              >
                Отменить
              </Button>
            </div>
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
      )}

      {isBlocked && isTrainer() && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={(e) => { e.stopPropagation(); blockMutation.mutate(false); }}
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
            <Button onClick={handleLoginClick} className="w-full" size="sm">
              <LogIn className="mr-2 h-4 w-4" />
              Войти / Зарегистрироваться
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return cardContent;
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
      className={`flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border transition disabled:opacity-50 ${colors[color]}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BookingPaymentBadges({ studentId, dateStr }: { studentId: string; dateStr: string }) {
  const { data } = useQuery<StudentPaymentStatus>({
    queryKey: ["payment-status", studentId, dateStr],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/trainer/students/${studentId}/payment-status?date=${encodeURIComponent(dateStr)}`,
      );
      return r.json();
    },
    staleTime: 30_000,
  });

  if (!data) return null;

  const cvOk = data.hasMembership;
  const cvLabel = data.membershipKind === "monthly_cv" ? "ЧВ" : data.membershipKind === "one_time_bv" ? "БВ" : "ЧВ";
  const trainerOk = data.hasTrainerPayment;
  const trainerLabel = data.activeTrainerPayment
    ? `${Math.max(0, data.activeTrainerPayment.totalSessions - data.activeTrainerPayment.usedSessions)}/${data.activeTrainerPayment.totalSessions}`
    : "—";

  // Подробное содержимое подсказки для значка ЧВ/БВ.
  let cvTooltipNode: React.ReactNode;
  if (cvOk && data.membershipKind === "monthly_cv" && data.cvPaidDate && data.cvValidUntil) {
    const paid = parseISO(data.cvPaidDate);
    const validUntil = parseISO(data.cvValidUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.max(0, differenceInCalendarDays(validUntil, today));
    cvTooltipNode = (
      <div className="space-y-1 text-xs">
        <div className="font-semibold">ЧВ оплачен</div>
        <div>Оплата: {format(paid, "d MMMM yyyy", { locale: ru })}</div>
        <div>Действует до: {format(validUntil, "d MMMM yyyy", { locale: ru })} вкл.</div>
        <div className="text-gray-300 dark:text-gray-400">Осталось дней: {daysLeft}</div>
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
  } else {
    cvTooltipNode = <span className="text-xs">ЧВ/БВ не оплачены</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border cursor-help ${
              cvOk
                ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
                : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
            }`}
            data-testid={`badge-payment-cv-${studentId}`}
          >
            <Wallet className="h-2.5 w-2.5" />
            {cvOk ? cvLabel : "ЧВ ✗"}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">{cvTooltipNode}</TooltipContent>
      </Tooltip>
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
    </span>
  );
}
