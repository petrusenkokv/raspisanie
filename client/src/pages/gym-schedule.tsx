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
import { BlockNoteDialog } from "@/components/gym/block-note-dialog";
import { ScheduleSettingsDialog } from "@/components/gym/schedule-settings-dialog";
import { BroadcastDialog } from "@/components/gym/broadcast-dialog";
import { ProfileDialog } from "@/components/gym/profile-dialog";
import { ParentChildrenDialog } from "@/components/gym/parent-children-dialog";
import { ParentBookDialog } from "@/components/gym/parent-book-dialog";
import { RecurringBookingsDialog } from "@/components/gym/recurring-bookings-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGymStore, validateStoredUser, logoutFromServer } from "@/store/gym-store";
import { type User } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export function GymSchedulePage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");
  const [studentsPanelOpen, setStudentsPanelOpen] = useState(false);
  const [trainerBookDialogOpen, setTrainerBookDialogOpen] = useState(false);
  const [trainerBookSelfMode, setTrainerBookSelfMode] = useState(false);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [trainerProfileOpen, setTrainerProfileOpen] = useState(false);
  const [blockPeriodOpen, setBlockPeriodOpen] = useState(false);
  const [blockDayNoteDialogOpen, setBlockDayNoteDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const [parentChildrenOpen, setParentChildrenOpen] = useState(false);
  const [parentBookOpen, setParentBookOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [parentBookSlotId, setParentBookSlotId] = useState<string | null>(null);
  const [parentBookedStudentIds, setParentBookedStudentIds] = useState<string[]>([]);
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
  } = useGymStore();

  const { status: pushStatus, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } =
    usePushNotifications(currentUser?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  useWebSocket();

  useEffect(() => {
    void validateStoredUser();
  }, []);

  // One refresh after login/logout (invalidation refetches active queries once).
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
    queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
    queryClient.invalidateQueries({ queryKey: ["/api/schedule/settings"] });
  }, [currentUser?.id, isAuthenticated, queryClient]);

  // Sync recurring bookings once per trainer session (not on every schedule read).
  useEffect(() => {
    if (!isTrainer || !currentUser?.id) return;
    const key = `recurring-sync:${currentUser.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void apiRequest("POST", "/api/trainer/sync-recurring")
      .then(() => queryClient.invalidateQueries({ queryKey: ["schedule"] }))
      .catch(() => {
        sessionStorage.removeItem(key);
      });
  }, [isTrainer, currentUser?.id, queryClient]);

  // Refresh approval status when tab regains focus (no background polling).
  const isParentRole = currentUser?.role === "parent";
  const isParentMode = !!(currentUser as any)?.isParent;
  const canManageChildren = !!currentUser && (isParentRole || isParentMode);
  const isAlsoStudent = !!(currentUser as any)?.isAlsoStudent;
  const isPendingApproval =
    currentUser?.role === "student"
      ? !!(currentUser as any)?.isPendingApproval
      : isParentRole && isAlsoStudent && !!(currentUser as any)?.isPendingApproval;

  const { data: parentChildren = [] } = useQuery<User[]>({
    queryKey: ["/api/parent/children"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/parent/children");
      return r.json();
    },
    enabled: canManageChildren,
    staleTime: 30_000,
  });

  const familyStudentIds = useMemo(() => {
    if (!currentUser) return [];
    const ids = parentChildren.map((c) => c.id);
    if (canManageChildren && currentUser.id) {
      ids.push(currentUser.id);
      return Array.from(new Set(ids));
    }
    if (currentUser.role === "student" && currentUser.id) {
      return [currentUser.id];
    }
    return ids;
  }, [parentChildren, canManageChildren, currentUser]);

  const parentBookSlotDate = useMemo(() => {
    if (!parentBookSlotId) return undefined;
    const slot = schedule
      .flatMap((d) => d.timeSlots)
      .find((s) => s.id === parentBookSlotId);
    return slot?.date;
  }, [parentBookSlotId, schedule]);
  const { data: freshUserData } = useQuery<{ user: User }>({
    queryKey: [`/api/users/${currentUser?.id}`],
    enabled: !!currentUser?.id && isPendingApproval,
    staleTime: 60_000,
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
    mutationFn: async (vars: { date: string; blocked: boolean; blockNote?: string | null }) => {
      const r = await apiRequest("POST", "/api/trainer/block-day", vars);
      return r.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setBlockDayNoteDialogOpen(false);
      toast({
        title: vars.blocked ? "День закрыт" : "День открыт",
        description: vars.blocked && data.cancelledCount > 0 ? `Отменено записей: ${data.cancelledCount}` : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ["schedule", currentView, selectedDate.toISOString()],
    staleTime: 60_000,
    enabled: true,
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
    mutationFn: async ({ timeSlotId, studentId }: { timeSlotId: string; studentId: string }) => {
      const response = await apiRequest("POST", "/api/bookings", {
        timeSlotId,
        studentId,
        notes: "",
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
    mutationFn: async ({ bookingId, message }: { bookingId: string; message?: string }) => {
      const response = await apiRequest("PUT", `/api/bookings/${bookingId}/cancel`, {
        cancelledBy: currentUser?.id ?? null,
        message: message ?? undefined,
      });
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
    if (canManageChildren) {
      if (isParentRole && !isAlsoStudent && parentChildren.length === 0) {
        toast({
          variant: "destructive",
          title: "Добавьте ребёнка",
          description: "Сначала добавьте ребёнка в разделе «Мои дети».",
        });
        return;
      }
      const slot = schedule
        .flatMap((d) => d.timeSlots)
        .find((s) => s.id === timeSlotId);
      const bookedIds = slot
        ? slot.bookings
            .filter((b) => b.status !== "cancelled")
            .map((b) => b.studentId)
        : [];
      setParentBookedStudentIds(bookedIds);
      setParentBookSlotId(timeSlotId);
      setParentBookOpen(true);
      return;
    }
    if (isPendingApproval) {
      toast({
        title: "Ожидайте одобрения",
        description: "Запись станет доступна после того, как тренер одобрит вашу регистрацию.",
        variant: "destructive",
      });
      return;
    }
    bookMutation.mutate({ timeSlotId, studentId: currentUser.id });
  };

  const handleParentBookConfirm = (studentId: string) => {
    if (!parentBookSlotId) return;
    const target =
      studentId === currentUser?.id
        ? currentUser
        : parentChildren.find((c) => c.id === studentId);
    if ((target as any)?.isPendingApproval) {
      toast({
        variant: "destructive",
        title: "Ожидайте одобрения",
        description: "Тренер ещё не одобрил карточку этого ученика.",
      });
      return;
    }
    bookMutation.mutate(
      { timeSlotId: parentBookSlotId, studentId },
      {
        onSuccess: () => {
          setParentBookOpen(false);
          setParentBookSlotId(null);
        },
      },
    );
  };

  const handleCancel = (bookingId: string, message?: string) =>
    cancelMutation.mutate({ bookingId, message });

  const handleLogout = async () => {
    await logoutFromServer();
    toast({ title: "Выход выполнен", description: "Вы успешно вышли из системы" });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <CalendarHeader
        onStudentsOpen={() => setStudentsPanelOpen(true)}
        onSettingsOpen={() => setSettingsOpen(true)}
        onMyTrainingOpen={() => {
          setSelectedTimeSlotId(null);
          setTrainerBookSelfMode(true);
          setTrainerBookDialogOpen(true);
        }}
        onTrainerProfileOpen={() => setTrainerProfileOpen(true)}
        onProfileOpen={() => setProfileOpen(true)}
        onParentChildrenOpen={() => setParentChildrenOpen(true)}
        onChangePasswordOpen={() => setChangePasswordOpen(true)}
        isParent={canManageChildren}
        onLogin={() => { setAuthModalMode("login"); setAuthModalOpen(true); }}
        onRegister={() => { setAuthModalMode("register"); setAuthModalOpen(true); }}
        onLogout={handleLogout}
        isAuthenticated={isAuthenticated}
        isPendingApproval={isPendingApproval}
        currentUser={currentUser}
        pushStatus={pushStatus}
        pushLoading={pushLoading}
        onPushSubscribe={pushSubscribe}
        onPushUnsubscribe={pushUnsubscribe}
      />

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
              setTrainerBookSelfMode(false);
              setTrainerBookDialogOpen(true);
            }}
            familyStudentIds={familyStudentIds}
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
      <RecurringBookingsDialog open={recurringOpen} onOpenChange={setRecurringOpen} />
      <BookStudentDialog
        open={trainerBookDialogOpen}
        onOpenChange={(open) => {
          setTrainerBookDialogOpen(open);
          if (!open) {
            setSelectedTimeSlotId(null);
            setTrainerBookSelfMode(false);
          }
        }}
        preselectedTimeSlotId={selectedTimeSlotId}
        forceSelfMode={trainerBookSelfMode}
      />
      <ChangePasswordDialog
        open={changePasswordOpen || !!(currentUser as any)?.mustChangePassword}
        onOpenChange={setChangePasswordOpen}
        forced={!!(currentUser as any)?.mustChangePassword}
      />
      <BlockPeriodDialog open={blockPeriodOpen} onOpenChange={setBlockPeriodOpen} />
      {dayBlockedState && (
        <BlockNoteDialog
          open={blockDayNoteDialogOpen}
          onOpenChange={setBlockDayNoteDialogOpen}
          title="Закрыть день"
          description={`Все слоты ${format(new Date(dayBlockedState.dateStr + "T12:00:00"), "d MMMM yyyy", { locale: ru })} будут закрыты. Существующие записи отменятся.`}
          confirmLabel="Закрыть день"
          pending={blockDayMutation.isPending}
          onConfirm={(note) =>
            blockDayMutation.mutate({
              date: dayBlockedState.dateStr,
              blocked: true,
              blockNote: note,
            })
          }
        />
      )}
      <ScheduleSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        dayBlockedState={dayBlockedState}
        blockDayPending={blockDayMutation.isPending}
        onToggleBlockDay={() => {
          if (!dayBlockedState) return;
          if (dayBlockedState.allBlocked) {
            blockDayMutation.mutate({
              date: dayBlockedState.dateStr,
              blocked: false,
            });
            return;
          }
          setBlockDayNoteDialogOpen(true);
        }}
        onOpenBlockPeriod={() => setBlockPeriodOpen(true)}
        onOpenBroadcast={() => setBroadcastOpen(true)}
      />
      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <ParentChildrenDialog open={parentChildrenOpen} onOpenChange={setParentChildrenOpen} />
      <ParentBookDialog
        open={parentBookOpen}
        onOpenChange={(open) => {
          setParentBookOpen(open);
          if (!open) {
            setParentBookSlotId(null);
            setParentBookedStudentIds([]);
          }
        }}
        children={parentChildren}
        currentUser={currentUser}
        isAlsoStudent={isParentRole ? isAlsoStudent : true}
        bookedStudentIds={parentBookedStudentIds}
        slotDate={parentBookSlotDate}
        loading={bookMutation.isPending}
        onConfirm={handleParentBookConfirm}
      />
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
