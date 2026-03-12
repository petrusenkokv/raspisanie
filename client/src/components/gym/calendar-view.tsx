import { useMemo } from "react";
import { useGymStore } from "@/store/gym-store";
import { TimeSlot } from "./time-slot";
import { Card } from "@/components/ui/card";
import { type TimeSlotWithBookings } from "@shared/schema";
import { format, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";

interface CalendarViewProps {
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string) => void;
  onLoginRequest: () => void;
  onTrainerBook?: (timeSlotId: string) => void;
}

export function CalendarView({ onBook, onCancel, onLoginRequest, onTrainerBook }: CalendarViewProps) {
  const { currentView, selectedDate, schedule, getWeekDates, getMonthDates } = useGymStore();

  const viewData = useMemo(() => {
    if (currentView === "day") {
      return {
        dates: [selectedDate],
        showDate: false
      };
    } else if (currentView === "week") {
      return {
        dates: getWeekDates(selectedDate),
        showDate: true
      };
    } else {
      return {
        dates: getMonthDates(selectedDate),
        showDate: true
      };
    }
  }, [currentView, selectedDate, getWeekDates, getMonthDates]);

  const getScheduleForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return schedule.find(s => s.date === dateStr)?.timeSlots || [];
  };

  const renderDayView = (date: Date, timeSlots: TimeSlotWithBookings[], showDate: boolean) => (
    <div key={date.toISOString()} className="space-y-3">
      {showDate && (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {format(date, "EEEE, d MMMM", { locale: ru })}
          </h3>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {timeSlots.filter(ts => ts.availableSpots > 0).length} свободных слотов
          </span>
        </div>
      )}
      
      <div className={`grid gap-3 ${
        currentView === "day" 
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" 
          : "grid-cols-1"
      }`}>
        {timeSlots.length > 0 ? (
          timeSlots.map((timeSlot) => (
            <TimeSlot
              key={timeSlot.id}
              timeSlot={timeSlot}
              onBook={onBook}
              onCancel={onCancel}
              onLoginRequest={onLoginRequest}
              onTrainerBook={onTrainerBook}
            />
          ))
        ) : (
          <Card className="p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Расписание на этот день не создано
            </p>
          </Card>
        )}
      </div>
    </div>
  );

  if (currentView === "month") {
    // Month view - grid layout
    const weeks = [];
    const dates = viewData.dates;
    for (let i = 0; i < dates.length; i += 7) {
      weeks.push(dates.slice(i, i + 7));
    }

    return (
      <div className="space-y-4">
        {/* Month header */}
        <div className="grid grid-cols-7 gap-2">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
            <div key={day} className="p-2 text-center font-semibold text-gray-600 dark:text-gray-400">
              {day}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div className="space-y-2">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-2">
              {week.map((date) => {
                const timeSlots = getScheduleForDate(date);
                const availableSlots = timeSlots.filter(ts => ts.availableSpots > 0).length;
                const totalSlots = timeSlots.length;
                const isToday = isSameDay(date, new Date());
                const isSelected = isSameDay(date, selectedDate);

                return (
                  <Card 
                    key={date.toISOString()}
                    className={`p-2 h-20 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      isToday ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" : ""
                    } ${
                      isSelected ? "ring-2 ring-blue-500" : ""
                    }`}
                    onClick={() => useGymStore.getState().setSelectedDate(date)}
                    data-testid={`calendar-day-${format(date, "yyyy-MM-dd")}`}
                  >
                    <div className="flex flex-col h-full">
                      <span className={`text-sm font-medium ${
                        isToday ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"
                      }`}>
                        {format(date, "d")}
                      </span>
                      
                      {totalSlots > 0 && (
                        <div className="flex-1 flex flex-col justify-end">
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {availableSlots}/{totalSlots}
                          </div>
                          <div className={`h-1 rounded-full mt-1 ${
                            availableSlots === 0 
                              ? "bg-red-300" 
                              : availableSlots < totalSlots / 2 
                                ? "bg-yellow-300" 
                                : "bg-green-300"
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
      </div>
    );
  }

  // Day and Week views
  return (
    <div className={`space-y-6 ${
      currentView === "week" ? "space-y-8" : ""
    }`}>
      {viewData.dates.map((date) => {
        const timeSlots = getScheduleForDate(date);
        return renderDayView(date, timeSlots, viewData.showDate);
      })}
    </div>
  );
}