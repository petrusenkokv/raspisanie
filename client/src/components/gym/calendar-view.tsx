import { useMemo, useState } from "react";
import { useGymStore } from "@/store/gym-store";
import { TimeSlot } from "./time-slot";
import { DaySlotRow } from "./day-slot-row";
import { MonthDayCellHint } from "./month-day-cell-hint";
import { MonthCalendarLegend } from "./month-calendar-legend";
import { CalendarCellHint, type CalendarCellHintLevel } from "./calendar-cell-hint";
import { SlotSessionPrice } from "./slot-session-price";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { type TimeSlotWithBookings, type Holiday, type WeeklyTemplate } from "@shared/schema";
import { getBlockedSlotLabel } from "@shared/block-display";
import { BlockNoteDialog } from "./block-note-dialog";
import { BookingSourceBadge } from "./booking-source-badge";
import {
  formatStudentShortName,
  isSlotInWorkingHours,
  isWorkingDayByTemplate,
  shouldShowMembershipBadge,
  shouldShowTrainerPaymentBadge,
} from "@/lib/utils-gym";
import { BookingPaymentBadges, useStudentPaymentStatus } from "./booking-payment-badges";
import { MembershipBlockedButton } from "./membership-blocked-button";
import {
  MEMBERSHIP_BOOKING_BLOCK_MESSAGE,
  MEMBERSHIP_CANCEL_BLOCK_MESSAGE,
} from "@shared/membership-booking";
import {
  monthDayStudentTooltip,
  monthDayGuestTooltip,
  studentAvailabilityHint,
  studentSlotBadgeText,
  getStudentSlotAvailability,
  getStudentSlotFillLevel,
  getMonthDayStudentFillLevel,
  getMonthDayGuestFillLevel,
  weekCellStudentFillClasses,
  weekCellGuestAvailableClasses,
  weekCellGuestFullClasses,
  weekCellStudentBookedClasses,
  monthCellStudentFillClasses,
  monthCellGuestFillClasses,
} from "@/lib/slot-availability-ui";
import { format, isSameDay, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Clock, Users, UserCheck, LogIn, UserPlus, Lock, Unlock } from "lucide-react";
import { useTrainerBookingCancel } from "./trainer-cancel-booking";
import { useStudentBookingCancel } from "./student-cancel-booking";
import { useMutation, useQuery } from "@tanstack/react-query";

function minutesUntilSlotMoscow(date: string, time: string): number {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  const ms = new Date(`${date}T${t}:00+03:00`).getTime();
  if (isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Math.round((ms - Date.now()) / 60_000);
}

function monthDayBookingLabel(booked: number, capacity: number): string {
  if (capacity <= 0) return "";
  if (booked === 0) return "нет записей";
  const mod10 = booked % 10;
  const mod100 = booked % 100;
  let word = "записей";
  if (mod10 === 1 && mod100 !== 11) word = "запись";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = "записи";
  return `${booked} ${word}`;
}
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CalendarViewProps {
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string, message?: string) => void;
  onConfirm: (bookingId: string) => void;
  onLoginRequest: (mode?: "login" | "register") => void;
  onTrainerBook?: (timeSlotId: string) => void;
  familyStudentIds?: string[];
}

export function CalendarView({ onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook, familyStudentIds = [] }: CalendarViewProps) {
  const { currentView, selectedDate, schedule, getWeekDates, getMonthDates, isTrainer, currentUser } = useGymStore();
  const { data: scheduleSettingsData } = useQuery<{
    holidays?: Holiday[];
    weeklyTemplate?: WeeklyTemplate;
  }>({
    queryKey: ["/api/schedule/settings"],
    staleTime: 60_000,
  });
  const holidays: Holiday[] = scheduleSettingsData?.holidays ?? [];
  const weeklyTemplate = scheduleSettingsData?.weeklyTemplate;

  // Format date using LOCAL timezone (toISOString gives UTC which can shift the date)
  const localDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const getScheduleForDate = (date: Date) => {
    return schedule.find((s) => s.date === localDateStr(date))?.timeSlots || [];
  };

  // ─── Day view ───────────────────────────────────────────────────────────────
  if (currentView === "day") {
    const timeSlots = getScheduleForDate(selectedDate);
    const viewerIsTrainer = isTrainer();
    return (
      <div>
        <div className="sm:hidden space-y-1">
          {timeSlots.length > 0 ? (
            timeSlots.map((ts) => (
              <DaySlotRow
                key={ts.id}
                timeSlot={ts}
                familyStudentIds={familyStudentIds}
                onBook={onBook}
                onCancel={onCancel}
                onConfirm={onConfirm}
                onLoginRequest={onLoginRequest}
                onTrainerBook={onTrainerBook}
              />
            ))
          ) : (
            <Card className="p-4 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Расписание на этот день не создано</p>
            </Card>
          )}
        </div>
        <div className="hidden sm:grid gap-3 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {timeSlots.length > 0 ? (
            timeSlots.map((ts) => (
              <TimeSlot
                key={ts.id}
                timeSlot={ts}
                familyStudentIds={familyStudentIds}
                onBook={onBook}
                onCancel={onCancel}
                onConfirm={onConfirm}
                onLoginRequest={onLoginRequest}
                onTrainerBook={onTrainerBook}
              />
            ))
          ) : (
            <Card className="col-span-full p-6 text-center">
              <p className="text-gray-500 dark:text-gray-400">Расписание на этот день не создано</p>
            </Card>
          )}
        </div>
        {!viewerIsTrainer && <MonthCalendarLegend />}
      </div>
    );
  }

  // ─── Month view ─────────────────────────────────────────────────────────────
  if (currentView === "month") {
    const dates = getMonthDates(selectedDate);
    const monthFamilyIds =
      familyStudentIds.length > 0
        ? familyStudentIds
        : currentUser?.id
          ? [currentUser.id]
          : [];
    const viewerIsTrainer = isTrainer();
    const viewerIsGuest = !currentUser && !viewerIsTrainer;

    // Build a sorted list of holiday dates for fast period lookup.
    const holidayMap = new Map(holidays.map((h) => [h.date, h]));
    const holidayDates = Array.from(holidayMap.keys()).sort();

    // For a given date string, find the contiguous holiday period that
    // includes it (sequential days with the same name treated as one period).
    const getHolidayPeriod = (dateStr: string): { start: string; end: string; name: string | null } | null => {
      const h = holidayMap.get(dateStr);
      if (!h) return null;
      const idx = holidayDates.indexOf(dateStr);
      const addDays = (s: string, n: number) => {
        const d = parseISO(s);
        d.setDate(d.getDate() + n);
        return localDateStr(d);
      };
      let start = dateStr;
      let end = dateStr;
      // Walk backwards
      for (let i = idx - 1; i >= 0; i--) {
        const prev = holidayDates[i];
        if (prev !== addDays(start, -1)) break;
        const prevH = holidayMap.get(prev)!;
        if ((prevH.name ?? null) !== (h.name ?? null)) break;
        start = prev;
      }
      // Walk forwards
      for (let i = idx + 1; i < holidayDates.length; i++) {
        const nxt = holidayDates[i];
        if (nxt !== addDays(end, 1)) break;
        const nxtH = holidayMap.get(nxt)!;
        if ((nxtH.name ?? null) !== (h.name ?? null)) break;
        end = nxt;
      }
      return { start, end, name: h.name ?? null };
    };

    // Align first day to Monday-based grid (Mon=0 … Sun=6)
    const firstDay = dates[0].getDay(); // 0=Sun,1=Mon,...,6=Sat
    const leadingEmpties = firstDay === 0 ? 6 : firstDay - 1;

    // Build padded array: null = empty cell, Date = actual day
    const padded: (Date | null)[] = [
      ...Array(leadingEmpties).fill(null),
      ...dates,
    ];

    // Split into rows of 7
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1">
          {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d) => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date, di) => {
              if (!date) {
                return <div key={`empty-${wi}-${di}`} className="h-20 sm:h-[5.25rem]" />;
              }
              const slots = getScheduleForDate(date);
              const openSlots = slots.filter((ts) => !ts.isBlocked);
              const booked = openSlots.reduce(
                (sum, ts) =>
                  sum +
                  ts.bookings.filter((b) => b.status === "confirmed" || b.status === "pending").length,
                0,
              );
              const capacity = openSlots.reduce((sum, ts) => sum + ts.maxCapacity, 0);
              const isToday = isSameDay(date, new Date());
              const isSelected = isSameDay(date, selectedDate);
              const dateStr = localDateStr(date);
              const period = getHolidayPeriod(dateStr);
              const isWorkday = isWorkingDayByTemplate(dateStr, weeklyTemplate);
              const trainerClosedInWorkingHours = slots.some(
                (ts) =>
                  ts.isBlocked &&
                  (ts.blockReason === "manual" || ts.blockReason === "holiday") &&
                  isSlotInWorkingHours(ts.time, dateStr, weeklyTemplate),
              );
              // Отпуск/закрытие периода ставит manual на все слоты, в т.ч. в выходные по шаблону
              const trainerClosedManually =
                openSlots.length === 0 &&
                slots.length > 0 &&
                slots.some(
                  (ts) => ts.blockReason === "manual" || ts.blockReason === "holiday",
                );
              const trainerClosedNote = slots.find(
                (ts) =>
                  ts.isBlocked &&
                  (ts.blockReason === "manual" || ts.blockReason === "holiday") &&
                  ts.blockNote?.trim(),
              )?.blockNote?.trim();
              const isTrainerClosed =
                !!period ||
                trainerClosedInWorkingHours ||
                trainerClosedManually;
              const isTemplateDayOff = !isTrainerClosed && openSlots.length === 0;

              let tooltipNode: React.ReactNode = null;
              if (isTrainerClosed) {
                const rangeLabel = period
                  ? period.start === period.end
                    ? format(parseISO(period.start), "d MMMM yyyy", { locale: ru })
                    : `${format(parseISO(period.start), "d MMM", { locale: ru })} — ${format(parseISO(period.end), "d MMM yyyy", { locale: ru })}`
                  : null;
                const reasonText = period
                  ? period.name?.trim() || trainerClosedNote || "Отпуск / выходной"
                  : trainerClosedNote || "Закрыто тренером";
                tooltipNode = (
                  <div className="space-y-1 text-xs">
                    <div className="font-semibold">{reasonText}</div>
                    {rangeLabel && (
                      <div className="text-gray-300 dark:text-gray-400">Период: {rangeLabel}</div>
                    )}
                  </div>
                );
              } else if (isTemplateDayOff) {
                tooltipNode = (
                  <div className="text-xs">
                    {isWorkday ? "Нет открытых слотов" : "Выходной по расписанию"}
                  </div>
                );
              } else if (openSlots.length > 0 && viewerIsTrainer) {
                tooltipNode = (
                  <div className="text-xs">
                    Записано {booked} из {capacity} мест в {openSlots.length}{" "}
                    {openSlots.length === 1 ? "слоте" : openSlots.length < 5 ? "слотах" : "слотах"}
                  </div>
                );
              } else if (openSlots.length > 0 && currentUser && !viewerIsTrainer) {
                tooltipNode = (
                  <div className="text-xs">
                    {monthDayStudentTooltip(openSlots, monthFamilyIds)}
                  </div>
                );
              } else if (openSlots.length > 0 && viewerIsGuest) {
                tooltipNode = (
                  <div className="text-xs">{monthDayGuestTooltip(openSlots)}</div>
                );
              }

              const monthStudentFill =
                openSlots.length > 0 &&
                !isTrainerClosed &&
                !isTemplateDayOff &&
                currentUser &&
                !viewerIsTrainer
                  ? getMonthDayStudentFillLevel(openSlots, monthFamilyIds)
                  : null;
              const monthGuestFill =
                openSlots.length > 0 &&
                !isTrainerClosed &&
                !isTemplateDayOff &&
                viewerIsGuest
                  ? getMonthDayGuestFillLevel(openSlots)
                  : null;
              const monthColorFill = monthStudentFill ?? monthGuestFill;

              const cardContent = (
                <Card
                  className={`p-2 h-20 sm:h-[5.25rem] cursor-pointer transition-colors ${
                    isTrainerClosed
                      ? "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                      : isTemplateDayOff
                        ? "bg-gray-50/80 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-800"
                        : monthStudentFill
                          ? monthCellStudentFillClasses[monthStudentFill]
                          : monthGuestFill
                            ? monthCellGuestFillClasses[monthGuestFill]
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  } ${
                    isToday && !isTrainerClosed && !monthColorFill
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200"
                      : ""
                  } ${
                    isToday && !isTrainerClosed && monthColorFill
                      ? "ring-1 ring-blue-400 dark:ring-blue-500"
                      : ""
                  } ${isSelected ? "ring-2 ring-blue-500" : ""}`}
                  onClick={() => {
                    const store = useGymStore.getState();
                    store.setSelectedDate(date);
                    store.setCurrentView("day");
                  }}
                >
                  <div className="relative flex flex-col h-full">
                    <div className="flex items-center justify-between gap-1 shrink-0 relative z-10">
                      <span className={`text-sm font-medium ${
                        isTrainerClosed
                          ? "text-gray-500 dark:text-gray-400 line-through"
                          : isTemplateDayOff
                            ? "text-gray-400 dark:text-gray-500"
                            : isToday
                              ? "text-blue-600"
                              : "text-gray-900 dark:text-white"
                      }`}>
                        {format(date, "d")}
                      </span>
                    </div>
                    {openSlots.length > 0 && viewerIsTrainer && (
                      <div className="flex-1 flex flex-col justify-end">
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {monthDayBookingLabel(booked, capacity)}
                        </div>
                        {capacity > 0 && (
                          <div className="h-1 rounded-full mt-1 bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                booked === 0
                                  ? "bg-transparent"
                                  : booked >= capacity
                                    ? "bg-red-400"
                                    : booked >= capacity / 2
                                      ? "bg-yellow-400"
                                      : "bg-green-500"
                              }`}
                              style={{
                                width: `${Math.min(100, Math.round((booked / capacity) * 100))}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {monthColorFill && monthStudentFill && (
                      <MonthDayCellHint
                        openSlots={openSlots}
                        fillLevel={monthStudentFill}
                        familyStudentIds={monthFamilyIds}
                      />
                    )}
                    {monthColorFill && monthGuestFill && (
                      <MonthDayCellHint
                        openSlots={openSlots}
                        fillLevel={monthGuestFill === "empty" ? "guest-empty" : "guest-full"}
                        familyStudentIds={[]}
                      />
                    )}
                    {isTrainerClosed && (
                      <div className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-0 w-full px-0.5 pb-0.5 pointer-events-none">
                        <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 dark:text-gray-400 shrink-0" />
                        <span className="hidden lg:block text-[10px] font-medium leading-tight text-center truncate max-w-full px-0.5 text-gray-600 dark:text-gray-400">
                          {period?.name?.trim() || "Закрыто"}
                        </span>
                      </div>
                    )}
                    {isTemplateDayOff && (
                      <div className="flex-1 flex flex-col justify-end">
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {isWorkday ? "нет слотов" : "выходной"}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );

              if (tooltipNode) {
                return (
                  <Tooltip key={dateStr}>
                    <TooltipTrigger asChild>
                      <div>{cardContent}</div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">{tooltipNode}</TooltipContent>
                  </Tooltip>
                );
              }
              return <div key={dateStr}>{cardContent}</div>;
            })}
          </div>
        ))}
        {!viewerIsTrainer && <MonthCalendarLegend />}
      </div>
    );
  }

  // ─── Week view (compact timetable) ──────────────────────────────────────────
  return <WeekGrid
    dates={getWeekDates(selectedDate)}
    getScheduleForDate={getScheduleForDate}
    onBook={onBook}
    onCancel={onCancel}
    onConfirm={onConfirm}
    onLoginRequest={onLoginRequest}
    onTrainerBook={onTrainerBook}
    familyStudentIds={familyStudentIds}
  />;
}

const normalizeSlotTime = (time: string) => (time.length >= 5 ? time.slice(0, 5) : time);

const pickSlotForTime = (slots: TimeSlotWithBookings[], time: string): TimeSlotWithBookings | undefined => {
  const norm = normalizeSlotTime(time);
  const matching = slots.filter((s) => normalizeSlotTime(s.time) === norm);
  if (matching.length === 0) return undefined;
  if (matching.length === 1) return matching[0];
  return matching.sort((a, b) => {
    const aConfirmed = a.bookings.filter((x) => x.status === "confirmed").length;
    const bConfirmed = b.bookings.filter((x) => x.status === "confirmed").length;
    if (bConfirmed !== aConfirmed) return bConfirmed - aConfirmed;
    return b.bookings.length - a.bookings.length;
  })[0];
};

// ─── Compact week timetable ────────────────────────────────────────────────────
interface WeekGridProps {
  dates: Date[];
  getScheduleForDate: (date: Date) => TimeSlotWithBookings[];
  onBook: (id: string) => void;
  onCancel: (id: string, message?: string) => void;
  onConfirm: (id: string) => void;
  onLoginRequest: (mode?: "login" | "register") => void;
  onTrainerBook?: (id: string) => void;
  familyStudentIds?: string[];
}

function WeekGrid({ dates, getScheduleForDate, onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook, familyStudentIds = [] }: WeekGridProps) {
  const { currentUser, isTrainer } = useGymStore();
  const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
  const weekGridCols = "grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] sm:grid-cols-[3rem_repeat(7,minmax(0,1fr))] md:grid-cols-[3.75rem_repeat(7,minmax(0,1fr))]";

  // Collect all unique times across the week
  const allTimes = useMemo(() => {
    const times = new Set<string>();
    dates.forEach((d) => getScheduleForDate(d).forEach((ts) => times.add(normalizeSlotTime(ts.time))));
    return Array.from(times).sort();
  }, [dates, getScheduleForDate]);

  const formatWeekTimeLabel = (time: string) => {
    const t = time.length >= 5 ? time.slice(0, 5) : time;
    const [hour, minute] = t.split(":");
    if (!minute || minute === "00") return String(Number(hour));
    return t;
  };

  return (
    <div>
      <div className="w-full min-w-0">
        {/* Header row */}
        <div className={cn("grid gap-0.5 sm:gap-1 mb-1", weekGridCols)}>
          <div /> {/* time column placeholder */}
          {dates.map((date, dayIndex) => {
            const isToday = isSameDay(date, new Date());
            return (
              <div key={date.toISOString()} className={`text-center py-1 sm:py-2 rounded-md sm:rounded-lg min-w-0 ${
                isToday ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-50 dark:bg-gray-800"
              }`}>
                <div className={`text-[10px] sm:text-xs font-semibold leading-none ${
                  isToday ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                }`}>
                  {weekdayLabels[dayIndex]}
                </div>
                <div className={`text-xs sm:text-sm font-bold leading-tight mt-0.5 ${
                  isToday ? "text-blue-700 dark:text-blue-300" : "text-gray-800 dark:text-white"
                }`}>
                  {format(date, "d")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time rows */}
        <div className="space-y-0.5 sm:space-y-1">
          {allTimes.map((time) => (
            <div
              key={time}
              className={cn("grid gap-0.5 sm:gap-1 items-center", weekGridCols)}
            >
              {/* Time label */}
              <div className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 text-right pr-0.5 sm:pr-2 py-0.5 sm:py-1 tabular-nums leading-none">
                <span className="sm:hidden">{formatWeekTimeLabel(time)}</span>
                <span className="hidden sm:inline">{time.length >= 5 ? time.slice(0, 5) : time}</span>
              </div>

              {/* Slot cells */}
              {dates.map((date) => {
                const slots = getScheduleForDate(date);
                const ts = pickSlotForTime(slots, time);
                if (!ts) {
                  return (
                    <div
                      key={date.toISOString()}
                      className="h-8 sm:h-9 rounded bg-gray-100 dark:bg-gray-800 opacity-30 min-w-0"
                    />
                  );
                }
                return (
                  <WeekCell
                    key={date.toISOString()}
                    timeSlot={ts}
                    currentUser={currentUser}
                    isTrainer={isTrainer()}
                    onBook={onBook}
                    onCancel={onCancel}
                    onConfirm={onConfirm}
                    onLoginRequest={onLoginRequest}
                    onTrainerBook={onTrainerBook}
                    familyStudentIds={familyStudentIds}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {!isTrainer() && <MonthCalendarLegend />}
    </div>
  );
}

// ─── Single compact cell with popover ─────────────────────────────────────────
function getWeekSlotHintLevel(
  isBlocked: boolean,
  isGuest: boolean,
  isFull: boolean,
  occupiedCount: number,
  hasFamilyBooking: boolean,
): CalendarCellHintLevel {
  if (isBlocked) return "blocked";
  if (hasFamilyBooking) return "booked";
  if (isGuest) {
    if (isFull) return "guest-full";
    if (occupiedCount > 0) return "partial";
    return "guest-empty";
  }
  if (isFull) return "full";
  if (occupiedCount > 0) return "partial";
  return "empty";
}

interface WeekCellProps {
  timeSlot: TimeSlotWithBookings;
  currentUser: any;
  isTrainer: boolean;
  onBook: (id: string) => void;
  onCancel: (id: string, message?: string) => void;
  onConfirm: (id: string) => void;
  onLoginRequest: (mode?: "login" | "register") => void;
  onTrainerBook?: (id: string) => void;
  familyStudentIds?: string[];
}

function WeekCell({ timeSlot, currentUser, isTrainer, onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook, familyStudentIds = [] }: WeekCellProps) {
  const [open, setOpen] = useState(false);
  const [blockNoteDialogOpen, setBlockNoteDialogOpen] = useState(false);
  const { toast } = useToast();
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
  const isPast = minutesUntil < -60;
  const tooLateToBook =
    !isTrainer && bookingDeadlineH > 0 && minutesUntil <= bookingDeadlineH * 60;
  const tooLateToCancel =
    !isTrainer && cancelDeadlineH > 0 && minutesUntil <= cancelDeadlineH * 60;
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
        description: vars.blocked && data.cancelledCount > 0 ? `Отменено записей: ${data.cancelledCount}` : undefined,
      });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const confirmedBookings = timeSlot.bookings.filter((b) => b.status === "confirmed");
  const pendingBookings   = timeSlot.bookings.filter((b) => b.status === "pending");
  const allActive         = [...confirmedBookings, ...pendingBookings];

  const bookingStudentIds = familyStudentIds.length > 0
    ? familyStudentIds
    : currentUser?.id
      ? [currentUser.id]
      : [];
  const familyBookings = timeSlot.bookings.filter(
    (booking) => booking.status !== "cancelled" && bookingStudentIds.includes(booking.studentId),
  );
  const userBooking = familyBookings.find((b) => b.studentId === currentUser?.id) ?? familyBookings[0];
  const isBookingForCurrentUser = !!userBooking && userBooking.studentId === currentUser?.id;
  const bookedPersonName = userBooking
    ? formatStudentShortName(userBooking.student)
    : "";
  const isParentUser = currentUser?.role === "parent" || !!(currentUser as any)?.isParent;
  const isGuest = !currentUser && !isTrainer;
  const isDirectSelfBooking = currentUser?.role === "student";
  const showSelfMembershipBadge =
    !!currentUser &&
    !isTrainer &&
    isDirectSelfBooking &&
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
  const bookingMembershipCheck = userBooking
    ? shouldShowMembershipBadge(userBooking.student)
    : false;
  const { data: bookingPaymentStatus } = useStudentPaymentStatus(
    bookingMembershipCheck ? userBooking?.studentId : undefined,
    timeSlot.date,
    bookingMembershipCheck && !!userBooking,
  );
  const bookingBlockedByMembership =
    bookingMembershipCheck &&
    bookingPaymentStatus !== undefined &&
    !bookingPaymentStatus.hasMembership;

  const isFull    = timeSlot.availableSpots === 0;
  const isBlocked = timeSlot.isBlocked;
  const blockedLabel = getBlockedSlotLabel(timeSlot.blockReason, timeSlot.blockNote);
  const occupiedCount = allActive.length;
  const studentAvailability = getStudentSlotAvailability(isBlocked, isFull);
  const studentFillLevel = getStudentSlotFillLevel(isBlocked, isFull, occupiedCount);
  const hasFamilyBooking = familyBookings.length > 0;
  const hintLevel = getWeekSlotHintLevel(
    isBlocked,
    isGuest,
    isFull,
    occupiedCount,
    hasFamilyBooking,
  );

  // Cell colour
  const cellClass = isBlocked
    ? weekCellStudentFillClasses.blocked
    : isGuest
      ? isFull
        ? weekCellGuestFullClasses
        : occupiedCount > 0
          ? weekCellStudentFillClasses.partial
          : weekCellGuestAvailableClasses
    : isTrainer
    ? isFull
      ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300"
      : occupiedCount > 0
        ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 ring-1 ring-green-400"
        : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100"
    : hasFamilyBooking
    ? weekCellStudentBookedClasses
    : weekCellStudentFillClasses[studentFillLevel];

  const hintAriaLabel =
    hintLevel === "blocked"
      ? blockedLabel
      : hintLevel === "booked"
        ? "Ваша запись"
        : hintLevel === "guest-empty" || hintLevel === "empty"
          ? "Записаться"
          : hintLevel === "partial"
            ? "Мало мест"
            : "Занято";

  const cellContent = (
    <button
      className={`w-full min-w-0 h-8 sm:h-9 rounded text-[10px] sm:text-xs font-medium transition-colors flex items-center justify-center gap-0.5 sm:gap-1 ${cellClass}`}
      onClick={() => setOpen(true)}
      disabled={isBlocked && !isTrainer}
      aria-label={
        !isTrainer
          ? `${hintAriaLabel}, ${timeSlot.time.slice(0, 5)}`
          : undefined
      }
      title={
        isBlocked && !isTrainer
          ? blockedLabel
          : isGuest && !isBlocked
            ? "Нажмите, чтобы войти и записаться"
            : undefined
      }
    >
      {isTrainer ? (
        <>
          <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
          <span className="tabular-nums leading-none">
            {occupiedCount}/{timeSlot.maxCapacity}
          </span>
        </>
      ) : (
        <CalendarCellHint fillLevel={hintLevel} layout="week" />
      )}
    </button>
  );

  if (isBlocked && !isTrainer) return cellContent;

  // Trainer popover for blocked slot — allow unblocking
  if (isBlocked && isTrainer) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{cellContent}</PopoverTrigger>
        <PopoverContent className="w-60 p-3" side="bottom" align="center">
          <div className="space-y-2">
            <p className="text-sm font-medium">Слот {timeSlot.time}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{blockedLabel}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => blockMutation.mutate({ blocked: false })}
              disabled={blockMutation.isPending}
            >
              <Unlock className="h-3 w-3 mr-1" />
              Открыть
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{cellContent}</PopoverTrigger>
      <PopoverContent className="w-72 p-4" side="bottom" align="center">
        {/* Popover header */}
        <div className="flex items-center gap-2 mb-3 pb-2 border-b">
          <Clock className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-gray-900 dark:text-white">{timeSlot.time}</span>
          {!isBlocked && isTrainer && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {confirmedBookings.length}/{timeSlot.maxCapacity}
            </Badge>
          )}
          {!isBlocked && !isTrainer && currentUser && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {studentSlotBadgeText(studentAvailability)}
            </Badge>
          )}
        </div>

        {/* Trainer content */}
        {isTrainer && !isBlocked && (
          <div className="space-y-2 mb-3">
            {allActive.length === 0 && (
              <p className="text-sm text-gray-400">Нет записей</p>
            )}
            {allActive.map((booking) => (
              <div
                key={booking.id}
                className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                  booking.status === "pending"
                    ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700"
                    : "bg-gray-50 dark:bg-gray-800"
                }`}
              >
                <div className="flex items-center gap-1 min-w-0 flex-wrap">
                  {booking.status === "confirmed"
                    ? <UserCheck className="h-3 w-3 text-green-600 shrink-0" />
                    : <Clock className="h-3 w-3 text-yellow-600 shrink-0" />}
                  <span className="truncate text-gray-900 dark:text-white">
                    {formatStudentShortName(booking.student)}
                  </span>
                  {booking.bookingSource && (
                    <BookingSourceBadge source={booking.bookingSource} />
                  )}
                  <SlotSessionPrice studentIds={[booking.studentId]} inline />
                  <BookingPaymentBadges
                    studentId={booking.studentId}
                    dateStr={timeSlot.date}
                    showMembership={shouldShowMembershipBadge(booking.student)}
                    showTrainerPayment={shouldShowTrainerPaymentBadge(booking.student)}
                  />
                </div>
                <div className="flex gap-1 shrink-0">
                  {booking.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-green-600 hover:bg-green-50"
                      onClick={() => { onConfirm(booking.id); setOpen(false); }}
                      title="Подтвердить"
                    >
                      <UserCheck className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                    onClick={() => {
                      setOpen(false);
                      requestTrainerCancel({
                        bookingId: booking.id,
                        studentName: `${booking.student.firstName} ${booking.student.lastName ?? ""}`.trim(),
                        slotDate: timeSlot.date,
                        slotTime: timeSlot.time,
                        isPast,
                        isRecurring: !!booking.recurringBookingId,
                      });
                    }}
                    title={isPast ? "Удалить прошедшую запись" : "Удалить запись"}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
            {!isFull && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed text-blue-600"
                onClick={() => { onTrainerBook?.(timeSlot.id); setOpen(false); }}
              >
                + Записать ученика
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-gray-600"
              onClick={() => setBlockNoteDialogOpen(true)}
              disabled={blockMutation.isPending}
            >
              <Lock className="h-3 w-3 mr-1" />
              Заблокировать слот
            </Button>
          </div>
        )}

        {/* Student content */}
        {!isTrainer && currentUser && !isBlocked && (
          <div className="space-y-2">
            {userBooking ? (
              <>
                {userBooking.status === "pending" && (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-md">
                    <Clock className="h-4 w-4 text-yellow-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                        {isBookingForCurrentUser ? "Заявка подана" : `Заявка на ребёнка: ${bookedPersonName}`}
                      </p>
                      <p className="text-xs text-yellow-600">Ожидайте подтверждения</p>
                    </div>
                  </div>
                )}
                <SlotSessionPrice
                  studentIds={Array.from(new Set(familyBookings.map((b) => b.studentId)))}
                />
                {userBooking.status === "confirmed" && (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-md">
                    <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        {isBookingForCurrentUser ? "Вы записаны!" : `Записан ребёнок: ${bookedPersonName}`}
                      </p>
                      <p className="text-xs text-green-600">
                        {isBookingForCurrentUser ? "Тренер подтвердил" : "Запись оформлена с вашего аккаунта"}
                      </p>
                    </div>
                  </div>
                )}
                <MembershipBlockedButton
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600"
                  membershipBlocked={bookingBlockedByMembership}
                  membershipMessage={MEMBERSHIP_CANCEL_BLOCK_MESSAGE}
                  onClick={() => {
                    requestStudentCancel({
                      bookingId: userBooking.id,
                      personName: bookedPersonName || undefined,
                    });
                    setOpen(false);
                  }}
                  disabled={tooLateToCancel}
                  title={
                    tooLateToCancel
                      ? `Отмена закрыта менее чем за ${cancelDeadlineH} ч.`
                      : undefined
                  }
                >
                  {tooLateToCancel ? "Отмена закрыта" : "Отменить запись"}
                </MembershipBlockedButton>
                {tooLateToCancel && (
                  <p className="text-xs text-gray-500 text-center">
                    Свяжитесь с тренером для отмены.
                  </p>
                )}
                {isParentUser && !isFull && (
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={() => { onBook(timeSlot.id); setOpen(false); }}
                    disabled={tooLateToBook}
                    title={tooLateToBook ? `Запись закрыта менее чем за ${bookingDeadlineH} ч.` : undefined}
                  >
                    {tooLateToBook ? "Запись закрыта" : "Записать ещё"}
                  </Button>
                )}
              </>
            ) : isFull ? (
              <p className="text-sm text-gray-500 text-center py-1">Все занято</p>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {studentAvailabilityHint(false)}
                </p>
                {bookingStudentIds.length > 0 && (
                  <SlotSessionPrice studentIds={bookingStudentIds} />
                )}
                <MembershipBlockedButton
                  className="w-full"
                  size="sm"
                  membershipBlocked={blockedByMembership}
                  membershipMessage={MEMBERSHIP_BOOKING_BLOCK_MESSAGE}
                  onClick={() => { onBook(timeSlot.id); setOpen(false); }}
                  disabled={tooLateToBook}
                  title={
                    tooLateToBook
                      ? `Запись закрыта менее чем за ${bookingDeadlineH} ч.`
                      : undefined
                  }
                >
                  {tooLateToBook ? "Запись закрыта" : "Записаться"}
                </MembershipBlockedButton>
              </>
            )}
          </div>
        )}

        {/* Guest (not logged in) */}
        {!isTrainer && !currentUser && !isBlocked && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Войдите, чтобы записаться на <strong>{timeSlot.time}</strong>
            </p>
            <div className="flex flex-col gap-2">
              <Button className="w-full" size="sm" onClick={() => { onLoginRequest("login"); setOpen(false); }}>
                <LogIn className="mr-2 h-4 w-4" />
                Войти
              </Button>
              <Button variant="outline" className="w-full" size="sm" onClick={() => { onLoginRequest("register"); setOpen(false); }}>
                <UserPlus className="mr-2 h-4 w-4" />
                Зарегистрироваться
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
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
