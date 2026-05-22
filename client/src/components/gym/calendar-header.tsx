import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, Users, CalendarDays } from "lucide-react";
import { useGymStore, type ViewType } from "@/store/gym-store";
import { Badge } from "@/components/ui/badge";
import { isSameDay, isSameMonth, isSameWeek } from "date-fns";

const VIEW_LABELS: Record<ViewType, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

interface CalendarHeaderProps {
  onStudentsOpen: () => void;
}

export function CalendarHeader({ onStudentsOpen }: CalendarHeaderProps) {
  const {
    currentView,
    selectedDate,
    setCurrentView,
    setSelectedDate,
    isTrainer,
  } = useGymStore();

  const formatDateCompact = (date: Date) => {
    if (currentView === "week") {
      const weekDates = useGymStore.getState().getWeekDates(date);
      const start = weekDates[0];
      const end = weekDates[6];
      return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("ru-RU", { month: "short", year: "numeric" })}`;
    }
    if (currentView === "month") {
      return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    }
    return date.toLocaleDateString("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatDateLong = (date: Date) => {
    if (currentView === "week") {
      const weekDates = useGymStore.getState().getWeekDates(date);
      const start = weekDates[0];
      const end = weekDates[6];
      return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}`;
    }
    if (currentView === "month") {
      return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    }
    return date.toLocaleDateString("ru-RU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getMondayOf = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const navigateDate = (direction: 1 | -1) => {
    if (currentView === "day") {
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() + direction);
      setSelectedDate(newDate);
    } else if (currentView === "week") {
      const monday = getMondayOf(selectedDate);
      monday.setDate(monday.getDate() + direction * 7);
      setSelectedDate(monday);
    } else {
      const newDate = new Date(selectedDate);
      newDate.setMonth(selectedDate.getMonth() + direction);
      setSelectedDate(newDate);
    }
  };

  const handleViewChange = (view: ViewType) => {
    if (view === "week") {
      setSelectedDate(getMondayOf(selectedDate));
    }
    setCurrentView(view);
  };

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (currentView === "week") {
      setSelectedDate(getMondayOf(today));
    } else {
      setSelectedDate(today);
    }
  };

  const today = new Date();
  const isOnToday =
    currentView === "day"
      ? isSameDay(selectedDate, today)
      : currentView === "week"
        ? isSameWeek(selectedDate, today, { weekStartsOn: 1 })
        : isSameMonth(selectedDate, today);

  return (
    <div className="border-b bg-white dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-tight">
            <span className="sm:hidden">Расписание</span>
            <span className="hidden sm:inline">Расписание тренировок</span>
          </h1>
          {isTrainer() && (
            <Badge variant="secondary" className="flex-shrink-0 text-xs">Тренер</Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
              <Button
                key={view}
                variant={currentView === view ? "default" : "ghost"}
                size="sm"
                onClick={() => handleViewChange(view)}
                className="h-7 text-xs px-2 sm:px-3"
                data-testid={`button-view-${view}`}
              >
                <span className="sm:hidden">{view === "day" ? "Д" : view === "week" ? "Н" : "М"}</span>
                <span className="hidden sm:inline">{VIEW_LABELS[view]}</span>
              </Button>
            ))}
          </div>
          {isTrainer() && (
            <Button
              variant="outline"
              size="sm"
              onClick={onStudentsOpen}
              className="h-8"
              data-testid="button-students"
            >
              <Users className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Ученики</span>
            </Button>
          )}
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-3">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 px-2 py-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDate(-1)}
              data-testid="button-prev-date"
              className="flex-shrink-0 h-8 w-8 p-0"
              aria-label="Предыдущий период"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <h2 className="flex-1 min-w-0 text-center font-semibold text-gray-900 dark:text-white text-sm sm:text-base leading-snug px-1">
              <span className="md:hidden">{formatDateCompact(selectedDate)}</span>
              <span className="hidden md:inline">{formatDateLong(selectedDate)}</span>
            </h2>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDate(1)}
              data-testid="button-next-date"
              className="flex-shrink-0 h-8 w-8 p-0"
              aria-label="Следующий период"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant={isOnToday ? "secondary" : "outline"}
              size="sm"
              onClick={goToToday}
              disabled={isOnToday}
              className="flex-shrink-0 h-8"
              data-testid="button-today"
              title="Сегодня"
            >
              <CalendarDays className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Сегодня</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
