import { useEffect, useMemo, useState } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { CalendarHeader } from "@/components/gym/calendar-header";
import { CalendarView } from "@/components/gym/calendar-view";
import { AuthModal } from "@/components/gym/auth-modal";
import { StudentsPanel } from "@/components/gym/students-panel";
import { BookStudentDialog } from "@/components/gym/book-student-dialog";
import { ChangePasswordDialog } from "@/components/gym/change-password-dialog";
import { BlockPeriodDialog } from "@/components/gym/block-period-dialog";
import { ScheduleSettingsDialog } from "@/components/gym/schedule-settings-dialog";
import { BroadcastDialog } from "@/components/gym/broadcast-dialog";
import { ProfileDialog } from "@/components/gym/profile-dialog";
import { NotificationsPopover } from "@/components/gym/notifications-popover";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGymStore } from "@/store/gym-store";
import { type User } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, LogOut, UserPlus, UserCircle2, KeyRound, Lock, Unlock,
  CalendarOff, Settings, Send, MoreHorizontal, Users, Bell, BellOff,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function GymSchedulePage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [studentsPanelOpen, setStudentsPanelOpen] = useState(false);
  const [trainerBookDialogOpen, setTrainerBookDialogOpen] = useState(false);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [blockPeriodOpen, setBlockPeriodOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const {
    currentUser,
    isAuthenticated,
    currentView,
    selectedDate,
    schedule,
    setSchedule,
    setLoading,
    isTrainer,
    logout
  } = useGymStore();

  const { status: pushStatus, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } =
    usePushNotifications(currentUser?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  useWebSocket();

  const localDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const dayBlockedState = useMemo(() => {
    if (currentView !== "day") return null;
    const dateStr = localDate(selectedDate);
    const day = schedule.find((s) => s.date === dateStr);
    if (!day || day.timeSlots.length === 0) return null;
    const allBlocked = day.timeSlots.every((s) => s.isBlocked);
    return { allBlocked, dateStr };
  }, [currentView, selectedDate, schedule]);

  const blockDayMutation = useMutation({
    mutationFn: async (vars: { date: string; blocked: boolean }) => {
      const r = await apiRequest("POST", "/api/trainer/block-day", vars);
      return r.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({
        title: vars.blocked ? "День закрыт" : "День открыт",
        description: vars.blocked && data.cancelledCount > 0 ? `Отменено записей: ${data.cancelledCount}` : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ["schedule", currentView, selectedDate.toISOString()],
    staleTime: 0,
    queryFn: async () => {
      const localDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const mondayOf = (d: Date) => {
        const copy = new Date(d);
        const day = copy.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        copy.setDate(copy.getDate() + diff);
        return localDate(copy);
      };
      let url = "";
      if (currentView === "day") {
        url = `/api/schedule/day/${localDate(selectedDate)}`;
      } else if (currentView === "week") {
        url = `/api/schedule/week/${mondayOf(selectedDate)}`;
      } else {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth() + 1;
        url = `/api/schedule/month/${year}/${month}`;
      }
      const response = await apiRequest("GET", url);
      return response.json();
    }
  });

  const bookMutation = useMutation({
    mutationFn: async (timeSlotId: string) => {
      const response = await apiRequest("POST", "/api/bookings", {
        timeSlotId,
        studentId: currentUser?.id,
        notes: ""
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Заявка отправлена", description: "Ваша заявка на бронирование отправлена тренеру на подтверждение" });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Ошибка бронирования", description: error.message || "Не удалось создать бронирование" });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("PUT", `/api/bookings/${bookingId}/cancel`, { cancelledBy: currentUser?.id ?? null });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Бронирование отменено", description: "Запись успешно отменена" });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Ошибка отмены", description: error.message || "Не удалось отменить бронирование" });
    }
  });

  const confirmMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("PUT", `/api/bookings/${bookingId}/confirm`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Запись подтверждена", description: "Ученик уведомлён о подтверждении" });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Ошибка", description: "Не удалось подтвердить запись" });
    }
  });

  useEffect(() => {
    if (scheduleData) {
      if (Array.isArray(scheduleData)) {
        setSchedule(scheduleData);
      } else {
        setSchedule([scheduleData]);
      }
    }
    setLoading(isLoading);
  }, [scheduleData, isLoading, setSchedule, setLoading]);

  const handleBook = (timeSlotId: string) => {
    if (!currentUser) { setAuthModalOpen(true); return; }
    bookMutation.mutate(timeSlotId);
  };

  const handleCancel = (bookingId: string) => cancelMutation.mutate(bookingId);

  const handleLogout = () => {
    logout();
    toast({ title: "Выход выполнен", description: "Вы успешно вышли из системы" });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <CalendarHeader onStudentsOpen={() => setStudentsPanelOpen(true)} />

      {/* Action bar */}
      <div className="px-4 py-2 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-2">
        {/* Greeting */}
        <div className="min-w-0">
          {isAuthenticated && currentUser ? (
            <span className="text-sm text-gray-600 dark:text-gray-400 truncate block">
              Привет, <span className="font-medium">{currentUser.firstName}</span>!
              {currentUser.role === "trainer" && (
                <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded">
                  Тренер
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Войдите, чтобы записаться
            </span>
          )}
        </div>

        {/* Right side buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* ── DESKTOP: full buttons row ── */}
          <div className="hidden sm:flex items-center gap-2">
            {isAuthenticated && isTrainer() && currentView === "day" && dayBlockedState && (
              <Button variant="outline" size="sm"
                onClick={() => blockDayMutation.mutate({ date: dayBlockedState.dateStr, blocked: !dayBlockedState.allBlocked })}
                disabled={blockDayMutation.isPending} data-testid="button-block-day">
                {dayBlockedState.allBlocked
                  ? <><Unlock className="h-4 w-4 mr-2" />Открыть день</>
                  : <><Lock className="h-4 w-4 mr-2" />Закрыть день</>}
              </Button>
            )}
            {isAuthenticated && isTrainer() && (
              <Button variant="outline" size="sm" onClick={() => setBlockPeriodOpen(true)} data-testid="button-vacation">
                <CalendarOff className="h-4 w-4 mr-2" />Отпуск / период
              </Button>
            )}
            {isAuthenticated && isTrainer() && (
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} data-testid="button-schedule-settings">
                <Settings className="h-4 w-4 mr-2" />Настройки расписания
              </Button>
            )}
            {isAuthenticated && isTrainer() && (
              <Button variant="outline" size="sm" onClick={() => setBroadcastOpen(true)} data-testid="button-broadcast">
                <Send className="h-4 w-4 mr-2" />Рассылка
              </Button>
            )}
          </div>

          {/* Push notification toggle — for logged-in users on supported browsers */}
          {isAuthenticated && currentUser && pushStatus !== "unsupported" && (
            <Button
              variant="outline"
              size="sm"
              disabled={pushLoading}
              onClick={pushStatus === "granted" ? pushUnsubscribe : pushSubscribe}
              title={pushStatus === "granted" ? "Отключить push-уведомления" : "Включить push-уведомления на этом устройстве"}
            >
              {pushLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : pushStatus === "granted"
                  ? <Bell className="h-4 w-4 text-blue-600" />
                  : <BellOff className="h-4 w-4 text-gray-400" />}
            </Button>
          )}

          {/* Notifications — always visible when logged in */}
          {isAuthenticated && currentUser && (
            <NotificationsPopover userId={currentUser.id} isTrainer={isTrainer()} />
          )}

          {/* ── MOBILE: trainer actions dropdown ── */}
          {isAuthenticated && isTrainer() && (
            <div className="flex sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Действия тренера">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Управление</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setStudentsPanelOpen(true)}>
                    <Users className="h-4 w-4 mr-2" />Ученики
                  </DropdownMenuItem>
                  {currentView === "day" && dayBlockedState && (
                    <DropdownMenuItem
                      onClick={() => blockDayMutation.mutate({ date: dayBlockedState.dateStr, blocked: !dayBlockedState.allBlocked })}
                      disabled={blockDayMutation.isPending}>
                      {dayBlockedState.allBlocked
                        ? <><Unlock className="h-4 w-4 mr-2" />Открыть день</>
                        : <><Lock className="h-4 w-4 mr-2" />Закрыть день</>}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setBlockPeriodOpen(true)}>
                    <CalendarOff className="h-4 w-4 mr-2" />Отпуск / период
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <Settings className="h-4 w-4 mr-2" />Настройки расписания
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBroadcastOpen(true)}>
                    <Send className="h-4 w-4 mr-2" />Рассылка
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* User account menu */}
          {isAuthenticated ? (
            <>
              {/* Desktop: separate buttons */}
              <div className="hidden sm:flex items-center gap-2">
                {currentUser?.role !== "trainer" && (
                  <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)} data-testid="button-my-profile">
                    <UserCircle2 className="h-4 w-4 mr-2" />Мой профиль
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setChangePasswordOpen(true)} data-testid="button-change-password">
                  <KeyRound className="h-4 w-4 mr-2" />Сменить пароль
                </Button>
                <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="h-4 w-4 mr-2" />Выйти
                </Button>
              </div>

              {/* Mobile: user dropdown */}
              <div className="flex sm:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" aria-label="Меню пользователя">
                      <UserCircle2 className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="truncate max-w-[11rem]">
                      {currentUser?.firstName} {currentUser?.lastName ?? ""}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {currentUser?.role !== "trainer" && (
                      <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                        <UserCircle2 className="h-4 w-4 mr-2" />Мой профиль
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                      <KeyRound className="h-4 w-4 mr-2" />Сменить пароль
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
                      <LogOut className="h-4 w-4 mr-2" />Выйти
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          ) : (
            <Button size="sm" onClick={() => setAuthModalOpen(true)} data-testid="button-login">
              <UserPlus className="h-4 w-4 mr-2" />Войти
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Загрузка расписания...</span>
          </div>
        ) : (
          <CalendarView
            onBook={handleBook}
            onCancel={handleCancel}
            onConfirm={(bookingId) => confirmMutation.mutate(bookingId)}
            onLoginRequest={() => setAuthModalOpen(true)}
            onTrainerBook={(timeSlotId) => {
              setSelectedTimeSlotId(timeSlotId);
              setTrainerBookDialogOpen(true);
            }}
          />
        )}
      </div>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
      <StudentsPanel open={studentsPanelOpen} onOpenChange={setStudentsPanelOpen} />
      <BookStudentDialog
        open={trainerBookDialogOpen}
        onOpenChange={(open) => { setTrainerBookDialogOpen(open); if (!open) setSelectedTimeSlotId(null); }}
        preselectedTimeSlotId={selectedTimeSlotId}
      />
      <ChangePasswordDialog
        open={changePasswordOpen || !!(currentUser as any)?.mustChangePassword}
        onOpenChange={setChangePasswordOpen}
        forced={!!(currentUser as any)?.mustChangePassword}
      />
      <BlockPeriodDialog open={blockPeriodOpen} onOpenChange={setBlockPeriodOpen} />
      <ScheduleSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
