import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  Baby,
  CalendarDays,
  Settings,
  LogIn,
  UserPlus,
  UserCircle2,
  KeyRound,
  LogOut,
  Clock,
  Loader2,
} from "lucide-react";
import { useGymStore, type ViewType } from "@/store/gym-store";
import { Badge } from "@/components/ui/badge";
import { isSameDay, isSameMonth, isSameWeek } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationsPopover } from "@/components/gym/notifications-popover";
import { cn } from "@/lib/utils";
import type { User } from "@shared/schema";
import type { PushStatus } from "@/hooks/use-push-notifications";

const VIEW_LABELS: Record<ViewType, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

function ToolButton({
  onClick,
  disabled,
  active,
  children,
  testId,
  title,
}: {
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={cn(
        "h-9 rounded-md border border-transparent px-2.5 sm:px-3 text-sm font-medium whitespace-nowrap",
        "hover:bg-white hover:border-gray-200 hover:shadow-sm dark:hover:bg-gray-800 dark:hover:border-gray-600",
        active && "bg-white border-blue-200 text-blue-700 shadow-sm dark:bg-gray-800 dark:border-blue-800 dark:text-blue-300",
      )}
    >
      {children}
    </Button>
  );
}

export interface CalendarHeaderProps {
  onStudentsOpen: () => void;
  onSettingsOpen: () => void;
  onTrainerProfileOpen: () => void;
  onProfileOpen: () => void;
  onParentChildrenOpen?: () => void;
  onChangePasswordOpen: () => void;
  isParent?: boolean;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  isAuthenticated: boolean;
  isPendingApproval: boolean;
  currentUser: User | null;
  pushStatus: PushStatus;
  pushLoading: boolean;
  onPushSubscribe: () => void;
  onPushUnsubscribe: () => void;
}

export function CalendarHeader({
  onStudentsOpen,
  onSettingsOpen,
  onTrainerProfileOpen,
  onProfileOpen,
  onParentChildrenOpen,
  onChangePasswordOpen,
  isParent = false,
  onLogin,
  onRegister,
  onLogout,
  isAuthenticated,
  isPendingApproval,
  currentUser,
  pushStatus,
  pushLoading,
  onPushSubscribe,
  onPushUnsubscribe,
}: CalendarHeaderProps) {
  const {
    currentView,
    selectedDate,
    setCurrentView,
    setSelectedDate,
    isTrainer,
  } = useGymStore();

  const formatDateLong = (date: Date, compact = false) => {
    if (currentView === "week") {
      const weekDates = useGymStore.getState().getWeekDates(date);
      const start = weekDates[0];
      const end = weekDates[6];
      if (compact) {
        const m = String(start.getMonth() + 1).padStart(2, "0");
        return `${start.getDate()}–${end.getDate()}.${m}.${start.getFullYear()}`;
      }
      return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}`;
    }
    if (currentView === "month") {
      return date.toLocaleDateString("ru-RU", {
        month: compact ? "short" : "long",
        year: "numeric",
      });
    }
    return date.toLocaleDateString("ru-RU", {
      weekday: compact ? "short" : "long",
      day: "numeric",
      month: compact ? "short" : "long",
      year: "numeric",
    });
  };

  const navigateDate = (direction: 1 | -1) => {
    if (currentView === "day") {
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() + direction);
      setSelectedDate(newDate);
    } else if (currentView === "week") {
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() + direction * 7);
      setSelectedDate(newDate);
    } else {
      const newDate = new Date(selectedDate);
      newDate.setMonth(selectedDate.getMonth() + direction);
      setSelectedDate(newDate);
    }
  };

  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
  };

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate(today);
  };

  const today = new Date();
  const isOnToday =
    currentView === "day"
      ? isSameDay(selectedDate, today)
      : currentView === "week"
        ? isSameWeek(selectedDate, today, { weekStartsOn: 1 })
        : isSameMonth(selectedDate, today);

  const trainer = isTrainer();

  return (
    <header className="border-b bg-white dark:bg-gray-900 shadow-sm">
      {/* Date hero — главный фокус */}
      <div className="bg-gradient-to-b from-blue-50/90 to-white dark:from-blue-950/40 dark:to-gray-900 px-3 sm:px-4 pt-3 pb-3 border-b border-blue-100/80 dark:border-blue-900/40 overflow-x-hidden">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0" aria-hidden />
          <h1 className="text-sm font-semibold text-gray-600 dark:text-gray-300 truncate">
            Расписание тренировок
          </h1>
          {trainer && (
            <Badge variant="secondary" className="text-xs flex-shrink-0">Тренер</Badge>
          )}
          {isPendingApproval && (
            <Badge variant="outline" className="text-xs border-amber-300 text-amber-800 bg-amber-50 flex-shrink-0 ml-auto">
              <Clock className="h-3 w-3 mr-1 inline" />
              Ожидание
            </Badge>
          )}
        </div>

        <div className="space-y-3">
          {/* Строка 1: только дата и стрелки — на узком экране не делим место с «Сегодня» */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 flex-shrink-0 rounded-full bg-white/80 dark:bg-gray-900/80"
              onClick={() => navigateDate(-1)}
              data-testid="button-prev-date"
              aria-label="Предыдущий период"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex-1 min-w-0 px-1 text-center overflow-hidden">
              <p
                className="text-base md:text-lg font-bold text-gray-900 dark:text-white leading-snug whitespace-nowrap tabular-nums"
                title={formatDateLong(selectedDate)}
              >
                {formatDateLong(selectedDate, true)}
              </p>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 flex-shrink-0 rounded-full bg-white/80 dark:bg-gray-900/80"
              onClick={() => navigateDate(1)}
              data-testid="button-next-date"
              aria-label="Следующий период"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Строка 2: «Сегодня» и День / Неделя / Месяц */}
          <div className="flex flex-col items-stretch gap-2 w-full max-w-md mx-auto md:max-w-none md:flex-row md:flex-wrap md:justify-center">
            <Button
              variant={isOnToday ? "secondary" : "default"}
              size="sm"
              onClick={goToToday}
              disabled={isOnToday}
              className="h-9 rounded-full px-3 w-full md:w-auto shrink-0"
              data-testid="button-today"
            >
              <CalendarDays className="h-4 w-4 mr-1.5 shrink-0" />
              <span className="text-sm">Сегодня</span>
            </Button>
            <div className="grid grid-cols-3 gap-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white/90 dark:bg-gray-900 p-0.5 shadow-sm md:inline-flex md:w-auto md:gap-0">
              {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
                <Button
                  key={view}
                  variant={currentView === view ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleViewChange(view)}
                  className={cn(
                    "h-8 rounded-md px-2 text-xs md:text-sm min-w-0 w-full md:w-auto !whitespace-normal",
                    currentView !== view && "text-gray-600 dark:text-gray-400",
                  )}
                  data-testid={`button-view-${view}`}
                >
                  {VIEW_LABELS[view]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Панель действий — одна строка справа */}
      <div className="mx-3 sm:mx-4 my-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 w-full">
          {isPendingApproval && (
            <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 mr-auto sm:mr-0 order-first sm:order-none w-full sm:w-auto justify-center sm:justify-start">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              Ожидает одобрения
            </span>
          )}

          {!isAuthenticated ? (
            <>
              <ToolButton onClick={onLogin} testId="button-login">
                <LogIn className="h-4 w-4 mr-1.5" />
                Войти
              </ToolButton>
              <Button
                size="sm"
                className="h-9 rounded-md px-3"
                onClick={onRegister}
                data-testid="button-register"
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                Регистрация
              </Button>
            </>
          ) : (
            <>
              {trainer && (
                <>
                  <ToolButton onClick={onStudentsOpen} testId="button-students" title="Ученики">
                    <Users className="h-4 w-4 mr-1.5 text-blue-600" />
                    Ученики
                  </ToolButton>
                  <ToolButton onClick={onSettingsOpen} testId="button-schedule-settings" title="Настройки">
                    <Settings className="h-4 w-4 mr-1.5" />
                    Настройки
                  </ToolButton>
                </>
              )}
              {currentUser && (
                <>
                  {isParent && onParentChildrenOpen && (
                    <ToolButton onClick={onParentChildrenOpen} testId="button-my-children" title="Мои дети">
                      <Baby className="h-4 w-4 mr-1.5 text-blue-600" />
                      Мои дети
                    </ToolButton>
                  )}
                  <NotificationsPopover
                    userId={currentUser.id}
                    isTrainer={trainer}
                    pushStatus={pushStatus}
                    pushLoading={pushLoading}
                    onPushSubscribe={onPushSubscribe}
                    onPushUnsubscribe={onPushUnsubscribe}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2 rounded-lg bg-white dark:bg-gray-900 shadow-sm flex-shrink-0"
                        aria-label="Меню аккаунта"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 text-sm font-semibold">
                          {currentUser.firstName?.charAt(0) ?? "?"}
                        </span>
                        <span className="max-w-[7rem] truncate text-sm font-medium">
                          {currentUser.firstName}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="truncate">
                        {currentUser.firstName} {currentUser.lastName ?? ""}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {trainer ? (
                        <DropdownMenuItem onClick={onTrainerProfileOpen}>
                          <UserCircle2 className="h-4 w-4 mr-2" />Мой профиль
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={onProfileOpen}>
                          <UserCircle2 className="h-4 w-4 mr-2" />Мой профиль
                        </DropdownMenuItem>
                      )}
                      {!trainer && (
                        <DropdownMenuItem onClick={onChangePasswordOpen}>
                          <KeyRound className="h-4 w-4 mr-2" />Сменить пароль
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onLogout} className="text-red-600 dark:text-red-400">
                        <LogOut className="h-4 w-4 mr-2" />Выйти
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
