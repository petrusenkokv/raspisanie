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
      {/* ── Desktop: single row ── */}
      <div className="hidden sm:flex items-center justify-between px-4 py-3 gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-none">Расписание тренировок</h1>
          {isTrainer() && <Badge variant="secondary" className="ml-1">Тренер</Badge>}
        </div>

        <div className="flex items-center gap-1 flex-1 justify-center min-w-0">
          <Button variant="outline" size="sm" onClick={() => navigateDate(-1)} data-testid="button-prev-date" className="flex-shrink-0 h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center px-1 min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">
              {formatDateDesktop(selectedDate)}
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigateDate(1)} data-testid="button-next-date" className="flex-shrink-0 h-8 w-8 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant={isOnToday ? "secondary" : "outline"} size="sm" onClick={goToToday} disabled={isOnToday} className="flex-shrink-0 h-8" data-testid="button-today">
            <CalendarDays className="h-4 w-4 mr-1" />
            <span>Сегодня</span>
          </Button>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
              <Button key={view} variant={currentView === view ? "default" : "ghost"} size="sm"
                onClick={() => handleViewChange(view)} className="h-7 text-xs px-3" data-testid={`button-view-${view}`}>
                {VIEW_LABELS[view]}
              </Button>
            ))}
          </div>
          {isTrainer() && (
            <Button variant="outline" size="sm" onClick={onStudentsOpen} className="h-8" data-testid="button-students">
              <Users className="h-4 w-4 mr-2" />
              Ученики
            </Button>
          )}
        </div>
      </div>

      {/* ── Mobile: two rows ── */}
      <div className="sm:hidden">
        {/* Row 1: title + view toggle */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-none truncate">Расписание</h1>
          </div>
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 flex-shrink-0">
            {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
              <Button key={view} variant={currentView === view ? "default" : "ghost"} size="sm"
                onClick={() => handleViewChange(view)} className="h-7 text-xs px-2.5" data-testid={`button-view-${view}`}>
                {VIEW_LABELS_SHORT[view]}
              </Button>
            ))}
          </div>
        </div>

        {/* Row 2: date navigation */}
        <div className="flex items-center justify-between px-3 pb-2 gap-1">
          <Button variant="outline" size="sm" onClick={() => navigateDate(-1)} data-testid="button-prev-date" className="flex-shrink-0 h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <h2 className="flex-1 text-center font-semibold text-gray-900 dark:text-white text-sm leading-tight px-1">
            {formatDateMobile(selectedDate)}
          </h2>

          <Button variant="outline" size="sm" onClick={() => navigateDate(1)} data-testid="button-next-date" className="flex-shrink-0 h-8 w-8 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button variant={isOnToday ? "secondary" : "outline"} size="sm" onClick={goToToday} disabled={isOnToday}
            className="flex-shrink-0 h-8 w-8 p-0" data-testid="button-today" title="Сегодня">
            <CalendarDays className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
