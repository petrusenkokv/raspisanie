import { useEffect, useState } from "react";
import { CalendarHeader } from "@/components/gym/calendar-header";
import { CalendarView } from "@/components/gym/calendar-view";
import { AuthModal } from "@/components/gym/auth-modal";
import { StudentsPanel } from "@/components/gym/students-panel";
import { BookStudentDialog } from "@/components/gym/book-student-dialog";
import { Button } from "@/components/ui/button";
import { useGymStore } from "@/store/gym-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, UserPlus } from "lucide-react";

export function GymSchedulePage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [studentsPanelOpen, setStudentsPanelOpen] = useState(false);
  const [trainerBookDialogOpen, setTrainerBookDialogOpen] = useState(false);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const { 
    currentUser, 
    isAuthenticated, 
    currentView, 
    selectedDate, 
    setSchedule, 
    setLoading,
    logout
  } = useGymStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch schedule based on current view and selected date
  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ["schedule", currentView, selectedDate.toISOString()],
    staleTime: 0,
    refetchInterval: 15000,
    queryFn: async () => {
      // Format date in local timezone (avoids UTC offset shifting the date)
      const localDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      let url = "";
      if (currentView === "day") {
        url = `/api/schedule/day/${localDate(selectedDate)}`;
      } else if (currentView === "week") {
        // selectedDate is already set to Monday by the header navigation
        url = `/api/schedule/week/${localDate(selectedDate)}`;
      } else {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth() + 1;
        url = `/api/schedule/month/${year}/${month}`;
      }
      
      const response = await apiRequest("GET", url);
      return response.json();
    }
  });

  // Booking mutations
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
      toast({
        title: "Заявка отправлена",
        description: "Ваша заявка на бронирование отправлена тренеру на подтверждение"
      });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка бронирования",
        description: error.message || "Не удалось создать бронирование"
      });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("PUT", `/api/bookings/${bookingId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Бронирование отменено",
        description: "Запись успешно отменена"
      });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка отмены",
        description: error.message || "Не удалось отменить бронирование"
      });
    }
  });

  const confirmMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("PUT", `/api/bookings/${bookingId}/confirm`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Запись подтверждена",
        description: "Ученик уведомлён о подтверждении"
      });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось подтвердить запись"
      });
    }
  });

  // Update schedule when data changes
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
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    bookMutation.mutate(timeSlotId);
  };

  const handleCancel = (bookingId: string) => {
    cancelMutation.mutate(bookingId);
  };

  const handleLogout = () => {
    logout();
    toast({
      title: "Выход выполнен",
      description: "Вы успешно вышли из системы"
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <CalendarHeader onStudentsOpen={() => setStudentsPanelOpen(true)} />
      
      {/* User info and actions */}
      <div className="p-4 border-b bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            {isAuthenticated && currentUser ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Добро пожаловать, {currentUser.firstName}!
                </span>
                {currentUser.role === "trainer" && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                    Тренер
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Войдите, чтобы записаться на тренировки
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Выйти
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setAuthModalOpen(true)}
                data-testid="button-login"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Войти
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">
              Загрузка расписания...
            </span>
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

      <AuthModal 
        open={authModalOpen} 
        onOpenChange={setAuthModalOpen} 
      />

      <StudentsPanel
        open={studentsPanelOpen}
        onOpenChange={setStudentsPanelOpen}
      />

      <BookStudentDialog
        open={trainerBookDialogOpen}
        onOpenChange={(open) => {
          setTrainerBookDialogOpen(open);
          if (!open) setSelectedTimeSlotId(null);
        }}
        preselectedTimeSlotId={selectedTimeSlotId}
      />
    </div>
  );
}