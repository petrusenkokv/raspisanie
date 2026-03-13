import { useMemo, useState } from "react";
import { useGymStore } from "@/store/gym-store";
import { TimeSlot } from "./time-slot";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { type TimeSlotWithBookings } from "@shared/schema";
import { format, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { Clock, Users, UserCheck, LogIn } from "lucide-react";

interface CalendarViewProps {
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string) => void;
  onConfirm: (bookingId: string) => void;
  onLoginRequest: () => void;
  onTrainerBook?: (timeSlotId: string) => void;
}

export function CalendarView({ onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook }: CalendarViewProps) {
  const { currentView, selectedDate, schedule, getWeekDates, getMonthDates } = useGymStore();

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
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {timeSlots.length > 0 ? (
          timeSlots.map((ts) => (
            <TimeSlot
              key={ts.id}
              timeSlot={ts}
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
    );
  }

  // ─── Month view ─────────────────────────────────────────────────────────────
  if (currentView === "month") {
    const dates = getMonthDates(selectedDate);

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
                return <div key={`empty-${wi}-${di}`} className="h-20" />;
              }
              const slots = getScheduleForDate(date);
              const available = slots.filter((ts) => ts.availableSpots > 0).length;
              const isToday = isSameDay(date, new Date());
              const isSelected = isSameDay(date, selectedDate);
              return (
                <Card
                  key={localDateStr(date)}
                  className={`p-2 h-20 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    isToday ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200" : ""
                  } ${isSelected ? "ring-2 ring-blue-500" : ""}`}
                  onClick={() => {
                    const store = useGymStore.getState();
                    store.setSelectedDate(date);
                    store.setCurrentView("day");
                  }}
                >
                  <div className="flex flex-col h-full">
                    <span className={`text-sm font-medium ${isToday ? "text-blue-600" : "text-gray-900 dark:text-white"}`}>
                      {format(date, "d")}
                    </span>
                    {slots.length > 0 && (
                      <div className="flex-1 flex flex-col justify-end">
                        <div className="text-xs text-gray-500">{available}/{slots.length}</div>
                        <div className={`h-1 rounded-full mt-1 ${
                          available === 0 ? "bg-red-300" : available < slots.length / 2 ? "bg-yellow-300" : "bg-green-300"
                        }`} />
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ))}
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
  />;
}

// ─── Compact week timetable ────────────────────────────────────────────────────
interface WeekGridProps {
  dates: Date[];
  getScheduleForDate: (date: Date) => TimeSlotWithBookings[];
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
  onLoginRequest: () => void;
  onTrainerBook?: (id: string) => void;
}

function WeekGrid({ dates, getScheduleForDate, onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook }: WeekGridProps) {
  const { currentUser, isTrainer } = useGymStore();

  // Collect all unique times across the week
  const allTimes = useMemo(() => {
    const times = new Set<string>();
    dates.forEach((d) => getScheduleForDate(d).forEach((ts) => times.add(ts.time)));
    return Array.from(times).sort();
  }, [dates, getScheduleForDate]);

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div className="min-w-[500px]">
        {/* Header row */}
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `60px repeat(${dates.length}, 1fr)` }}>
          <div /> {/* time column placeholder */}
          {dates.map((date) => {
            const isToday = isSameDay(date, new Date());
            return (
              <div key={date.toISOString()} className={`text-center py-2 rounded-lg ${
                isToday ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-50 dark:bg-gray-800"
              }`}>
                <div className={`text-xs font-medium uppercase tracking-wide ${
                  isToday ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                }`}>
                  {format(date, "EEE", { locale: ru })}
                </div>
                <div className={`text-sm font-bold ${
                  isToday ? "text-blue-700 dark:text-blue-300" : "text-gray-800 dark:text-white"
                }`}>
                  {format(date, "d")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time rows */}
        <div className="space-y-1">
          {allTimes.map((time) => (
            <div
              key={time}
              className="grid gap-1 items-center"
              style={{ gridTemplateColumns: `60px repeat(${dates.length}, 1fr)` }}
            >
              {/* Time label */}
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 text-right pr-2 py-1">
                {time}
              </div>

              {/* Slot cells */}
              {dates.map((date) => {
                const slots = getScheduleForDate(date);
                const ts = slots.find((s) => s.time === time);
                if (!ts) return <div key={date.toISOString()} className="h-9 rounded bg-gray-100 dark:bg-gray-800 opacity-30" />;
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
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Single compact cell with popover ─────────────────────────────────────────
interface WeekCellProps {
  timeSlot: TimeSlotWithBookings;
  currentUser: any;
  isTrainer: boolean;
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
  onLoginRequest: () => void;
  onTrainerBook?: (id: string) => void;
}

function WeekCell({ timeSlot, currentUser, isTrainer, onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook }: WeekCellProps) {
  const [open, setOpen] = useState(false);

  const confirmedBookings = timeSlot.bookings.filter((b) => b.status === "confirmed");
  const pendingBookings   = timeSlot.bookings.filter((b) => b.status === "pending");
  const allActive         = [...confirmedBookings, ...pendingBookings];

  const userBooking = currentUser
    ? timeSlot.bookings.find((b) => b.studentId === currentUser.id && b.status !== "cancelled")
    : undefined;

  const isFull    = timeSlot.availableSpots === 0;
  const isBlocked = timeSlot.isBlocked;

  // Cell colour
  const cellClass = isBlocked
    ? "bg-gray-200 dark:bg-gray-700 text-gray-400"
    : userBooking?.status === "confirmed"
    ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 ring-1 ring-green-400"
    : userBooking?.status === "pending"
    ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 ring-1 ring-yellow-400"
    : isFull
    ? "bg-red-50 dark:bg-red-900/20 text-red-400"
    : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100";

  const cellContent = (
    <button
      className={`w-full h-9 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${cellClass}`}
      onClick={() => setOpen(true)}
      disabled={isBlocked && !isTrainer}
    >
      {isBlocked ? (
        <span className="text-xs">—</span>
      ) : userBooking?.status === "confirmed" ? (
        <><UserCheck className="h-3 w-3" /><span>Записан</span></>
      ) : userBooking?.status === "pending" ? (
        <><Clock className="h-3 w-3" /><span>Заявка</span></>
      ) : (
        <><Users className="h-3 w-3" /><span>{confirmedBookings.length}/{timeSlot.maxCapacity}</span></>
      )}
    </button>
  );

  if (isBlocked && !isTrainer) return cellContent;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{cellContent}</PopoverTrigger>
      <PopoverContent className="w-72 p-4" side="bottom" align="center">
        {/* Popover header */}
        <div className="flex items-center gap-2 mb-3 pb-2 border-b">
          <Clock className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-gray-900 dark:text-white">{timeSlot.time}</span>
          {!isBlocked && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {confirmedBookings.length}/{timeSlot.maxCapacity}
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
                <div className="flex items-center gap-1 min-w-0">
                  {booking.status === "confirmed"
                    ? <UserCheck className="h-3 w-3 text-green-600 shrink-0" />
                    : <Clock className="h-3 w-3 text-yellow-600 shrink-0" />}
                  <span className="truncate text-gray-900 dark:text-white">
                    {booking.student.firstName} {booking.student.lastName}
                  </span>
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
                    onClick={() => { onCancel(booking.id); setOpen(false); }}
                    title="Отменить"
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
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Заявка подана</p>
                      <p className="text-xs text-yellow-600">Ожидайте подтверждения</p>
                    </div>
                  </div>
                )}
                {userBooking.status === "confirmed" && (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-md">
                    <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">Вы записаны!</p>
                      <p className="text-xs text-green-600">Тренер подтвердил</p>
                    </div>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600"
                  onClick={() => { onCancel(userBooking.id); setOpen(false); }}
                >
                  Отменить запись
                </Button>
              </>
            ) : isFull ? (
              <p className="text-sm text-gray-500 text-center py-1">Мест не осталось</p>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Свободных мест: {timeSlot.availableSpots}
                </p>
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => { onBook(timeSlot.id); setOpen(false); }}
                >
                  Записаться
                </Button>
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
            <Button className="w-full" size="sm" onClick={() => { onLoginRequest(); setOpen(false); }}>
              <LogIn className="mr-2 h-4 w-4" />
              Войти / Зарегистрироваться
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
