import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, Users, CalendarDays } from "lucide-react";
import { useGymStore, type ViewType } from "@/store/gym-store";
import { Badge } from "@/components/ui/badge";
import { isSameDay, isSameMonth, isSameWeek } from "date-fns";

const VIEW_LABELS: Record<ViewType, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц"
};

const VIEW_LABELS_SHORT: Record<ViewType, string> = {
  day: "Д",
  week: "Н",
  month: "М"
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
    unreadCount
  } = useGymStore();

  const formatDateDesktop = (date: Date) => {
    if (currentView === "week") {
      const weekDates = useGymStore.getState().getWeekDates(date);
      const start = weekDates[0];
      const end = weekDates[6];
      return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}`;
    }
    if (currentView === "month") {
      return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    }
    return date.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };

  const formatDateMobile = (date: Date) => {
    if (currentView === "week") {
      const weekDates = useGymStore.getState().getWeekDates(date);
      const start = weekDates[0];
      const end = weekDates[6];
      return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("ru-RU", { month: "short" })}`;
    }
    if (currentView === "month") {
      return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    }
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
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
    } else if (currentView === "month") {
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
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        {/* Title */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-none">
            <span className="hidden sm:inline">Расписание тренировок</span>
            <span className="sm:hidden">Расписание</span>
          </h1>
          {isTrainer() && (
            <Badge variant="secondary" className="hidden sm:inline-flex ml-1">Тренер</Badge>
          )}
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1 flex-1 justify-center min-w-0">
          <Button variant="outline" size="sm" onClick={() => navigateDate(-1)} data-testid="button-prev-date"
            className="flex-shrink-0 h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="text-center px-1 min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">
              <span className="hidden sm:inline">{formatDateDesktop(selectedDate)}</span>
              <span className="sm:hidden">{formatDateMobile(selectedDate)}</span>
            </h2>
          </div>

          <Button variant="outline" size="sm" onClick={() => navigateDate(1)} data-testid="button-next-date"
            className="flex-shrink-0 h-8 w-8 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant={isOnToday ? "secondary" : "outline"}
            size="sm"
            onClick={goToToday}
            disabled={isOnToday}
            className="flex-shrink-0 h-8"
            data-testid="button-today"
            title="Перейти к сегодняшнему дню"
          >
            <CalendarDays className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Сегодня</span>
          </Button>
        </div>

        {/* Right: view toggle + students */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* View toggle */}
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
                <span className="hidden sm:inline">{VIEW_LABELS[view]}</span>
                <span className="sm:hidden">{VIEW_LABELS_SHORT[view]}</span>
              </Button>
            ))}
          </div>

          {/* Students button — desktop only (mobile uses the MoreHorizontal dropdown in action bar) */}
          {isTrainer() && (
            <Button
              variant="outline"
              size="sm"
              onClick={onStudentsOpen}
              className="hidden sm:flex h-8"
              data-testid="button-students"
            >
              <Users className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Ученики</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
