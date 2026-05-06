import { useEffect, useMemo, useState } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { CalendarHeader } from "@/components/gym/calendar-header";
import { CalendarView } from "@/components/gym/calendar-view";
import { AuthModal } from "@/components/gym/auth-modal";
import { StudentsPanel } from "@/components/gym/students-panel";
import { BookStudentDialog } from "@/components/gym/book-student-dialog";
import { ChangePasswordDialog } from "@/components/gym/change-password-dialog";
import { TrainerProfileDialog } from "@/components/gym/trainer-profile-dialog";
import { BlockPeriodDialog } from "@/components/gym/block-period-dialog";
import { ScheduleSettingsDialog } from "@/components/gym/schedule-settings-dialog";
import { BroadcastDialog } from "@/components/gym/broadcast-dialog";
import { ProfileDialog } from "@/components/gym/profile-dialog";
import { NotificationsPopover } from "@/components/gym/notifications-popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  Loader2, LogOut, LogIn, UserPlus, UserCircle2, KeyRound, Lock, Unlock,
  CalendarOff, Settings, Send, MoreHorizontal, Users, Bell, BellOff, Clock, MessageSquare,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function GymSchedulePage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");
  const [studentsPanelOpen, setStudentsPanelOpen] = useState(false);
  const [trainerBookDialogOpen, setTrainerBookDialogOpen] = useState(false);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [trainerProfileOpen, setTrainerProfileOpen] = useState(false);
  const [blockPeriodOpen, setBlockPeriodOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const {
    currentUser,
    isAuthenticated,
    currentView,
    selectedDate,
    schedule,
    setSchedule,
    setLoading,
    setUser,
    isTrainer,
    logout
  } = useGymStore();

  const { status: pushStatus, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } =
    usePushNotifications(currentUser?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  useWebSocket();

  // Poll current user status every 5 seconds while pending approval
  const isPendingApproval = !!(currentUser as any)?.isPendingApproval;
  const { data: freshUserData } = useQuery<{ user: User }>({
    queryKey: [`/api/users/${currentUser?.id}`],
    enabled: !!currentUser?.id && isPendingApproval,
    refetchInterval: 5000,
    staleTime: 0,
  });

  // When polling detects approval — update store and show welcome dialog
  useEffect(() => {
    if (freshUserData?.user && !(freshUserData.user as any).isPendingApproval && isPendingApproval) {
      setUser(freshUserData.user);
      if (!(freshUserData.user as any).welcomeShown) {
        setWelcomeDialogOpen(true);
      } else {
        toast({ title: "Регистрация одобрена", description: "Теперь вы можете записываться на тренировки!" });
      }
    }
  }, [freshUserData]);

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
    if (isPendingApproval) {
      toast({ title: "Ожидайте одобрения", description: "Запись станет доступна после того, как тренер одобрит вашу регистрацию.", variant: "destructive" });
      return;
    }
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

        {/* Pending approval banner */}
        {isPendingApproval && (
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            Ожидает одобрения тренера
          </span>
        )}

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
                {currentUser?.role === "trainer" && (
                  <Button variant="outline" size="sm" onClick={() => setTrainerProfileOpen(true)} data-testid="button-trainer-profile">
                    <UserCircle2 className="h-4 w-4 mr-2" />Мой профиль
                  </Button>
                )}
                {currentUser?.role !== "trainer" && !isPendingApproval && (
                  <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)} data-testid="button-my-profile">
                    <UserCircle2 className="h-4 w-4 mr-2" />Мой профиль
                  </Button>
                )}
                {currentUser?.role !== "trainer" && (
                  <Button variant="outline" size="sm" onClick={() => setChangePasswordOpen(true)} data-testid="button-change-password">
                    <KeyRound className="h-4 w-4 mr-2" />Сменить пароль
                  </Button>
                )}
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
                    {currentUser?.role === "trainer" && (
                      <DropdownMenuItem onClick={() => setTrainerProfileOpen(true)}>
                        <UserCircle2 className="h-4 w-4 mr-2" />Мой профиль
                      </DropdownMenuItem>
                    )}
                    {currentUser?.role !== "trainer" && !isPendingApproval && (
                      <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                        <UserCircle2 className="h-4 w-4 mr-2" />Мой профиль
                      </DropdownMenuItem>
                    )}
                    {currentUser?.role !== "trainer" && (
                      <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                        <KeyRound className="h-4 w-4 mr-2" />Сменить пароль
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
                      <LogOut className="h-4 w-4 mr-2" />Выйти
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAuthModalMode("login"); setAuthModalOpen(true); }} data-testid="button-login">
                <LogIn className="h-4 w-4 mr-2" />Войти
              </Button>
              <Button size="sm" onClick={() => { setAuthModalMode("register"); setAuthModalOpen(true); }} data-testid="button-register">
                <UserPlus className="h-4 w-4 mr-2" />Зарегистрироваться
              </Button>
            </div>
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
            onLoginRequest={(mode = "login") => { setAuthModalMode(mode); setAuthModalOpen(true); }}
            onTrainerBook={(timeSlotId) => {
              setSelectedTimeSlotId(timeSlotId);
              setTrainerBookDialogOpen(true);
            }}
          />
        )}
      </div>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} initialMode={authModalMode} />

      {/* Welcome dialog shown when trainer approves student while they wait on page */}
      <WelcomeDialog
        open={welcomeDialogOpen}
        onClose={async () => {
          setWelcomeDialogOpen(false);
          if (currentUser?.id) {
            await apiRequest("POST", `/api/users/${currentUser.id}/mark-welcome-shown`).catch(() => {});
          }
        }}
        userId={currentUser?.id}
        firstName={currentUser?.firstName}
      />
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
      <TrainerProfileDialog open={trainerProfileOpen} onOpenChange={setTrainerProfileOpen} />
    </div>
  );
}

function WelcomeDialog({ open, onClose, userId, firstName }: {
  open: boolean;
  onClose: () => void;
  userId?: string;
  firstName?: string;
}) {
  const { data: trainerSettings } = useQuery<{ welcomeMessage: string | null }>({
    queryKey: ["/api/schedule/settings"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/schedule/settings");
      return r.json();
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Вход в систему</DialogTitle>
          <DialogDescription className="text-center">Добро пожаловать!</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col items-center text-center gap-2 py-2">
            <div className="rounded-full bg-green-100 dark:bg-green-900/40 p-3">
              <MessageSquare className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
              Добро пожаловать{firstName ? `, ${firstName}` : ""}!
            </h3>
          </div>
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4">
            {trainerSettings?.welcomeMessage ? (
              <>
                <p className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wide mb-2">Сообщение от тренера</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{trainerSettings.welcomeMessage}</p>
              </>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
                Тренер одобрил вашу регистрацию. Теперь вы можете записываться на тренировки!
              </p>
            )}
          </div>
          <Button className="w-full" onClick={onClose}>
            Понятно, перейти к расписанию
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
