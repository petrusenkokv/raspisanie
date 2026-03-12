import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, Users, Bell } from "lucide-react";
import { useGymStore, type ViewType } from "@/store/gym-store";
import { Badge } from "@/components/ui/badge";

const VIEW_LABELS: Record<ViewType, string> = {
  day: "День",
  week: "Неделя", 
  month: "Месяц"
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

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long", 
      day: "numeric"
    };
    
    if (currentView === "week") {
      const weekDates = useGymStore.getState().getWeekDates(date);
      const start = weekDates[0];
      const end = weekDates[6];
      return `${start.getDate()}-${end.getDate()} ${start.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}`;
    }
    
    if (currentView === "month") {
      return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    }
    
    return date.toLocaleDateString("ru-RU", options);
  };

  const navigateDate = (direction: 1 | -1) => {
    const newDate = new Date(selectedDate);
    
    if (currentView === "day") {
      newDate.setDate(selectedDate.getDate() + direction);
    } else if (currentView === "week") {
      newDate.setDate(selectedDate.getDate() + (direction * 7));
    } else if (currentView === "month") {
      newDate.setMonth(selectedDate.getMonth() + direction);
    }
    
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 mb-4 sm:mb-0">
        <Calendar className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Расписание тренировок
        </h1>
        {isTrainer() && (
          <Badge variant="secondary" className="ml-2">
            Тренер
          </Badge>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateDate(-1)}
            data-testid="button-prev-date"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="text-center min-w-[200px]">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {formatDate(selectedDate)}
            </h2>
          </div>
          
          <Button
            variant="outline" 
            size="sm"
            onClick={() => navigateDate(1)}
            data-testid="button-next-date"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            data-testid="button-today"
          >
            Сегодня
          </Button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
            <Button
              key={view}
              variant={currentView === view ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentView(view)}
              className="text-xs px-3"
              data-testid={`button-view-${view}`}
            >
              {VIEW_LABELS[view]}
            </Button>
          ))}
        </div>

        {/* Notifications */}
        {isTrainer() && (
          <Button
            variant="outline"
            size="sm"
            className="relative"
            data-testid="button-notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs flex items-center justify-center"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>
        )}

        {/* Students List (Trainer only) */}
        {isTrainer() && (
          <Button
            variant="outline"
            size="sm"
            onClick={onStudentsOpen}
            data-testid="button-students"
          >
            <Users className="h-4 w-4 mr-2" />
            Ученики
          </Button>
        )}
      </div>
    </div>
  );
}