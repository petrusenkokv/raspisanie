import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, Users, UserCheck, LogIn, UserPlus, X, Check, Lock, Unlock } from "lucide-react";
import { type TimeSlotWithBookings } from "@shared/schema";
import { useGymStore } from "@/store/gym-store";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TimeSlotProps {
  timeSlot: TimeSlotWithBookings;
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string) => void;
  onConfirm: (bookingId: string) => void;
  onLoginRequest: () => void;
  onTrainerBook?: (timeSlotId: string) => void;
}

export function TimeSlot({ timeSlot, onBook, onCancel, onConfirm, onLoginRequest, onTrainerBook }: TimeSlotProps) {
  const { currentUser, isTrainer } = useGymStore();
  const { toast } = useToast();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const blockMutation = useMutation({
    mutationFn: async (blocked: boolean) => {
      const r = await apiRequest("PATCH", `/api/trainer/time-slots/${timeSlot.id}/block`, { blocked });
      return r.json();
    },
    onSuccess: (data, blocked) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({
        title: blocked ? "Слот заблокирован" : "Слот открыт",
        description: blocked && data.cancelledCount > 0
          ? `Отменено записей: ${data.cancelledCount}`
          : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const isFull = timeSlot.availableSpots === 0;
  const isBlocked = timeSlot.isBlocked;

  const userBooking = timeSlot.bookings.find(
    booking => booking.studentId === currentUser?.id && booking.status !== "cancelled"
  );

  const confirmedBookings = timeSlot.bookings.filter(b => b.status === "confirmed");
  const pendingBookings = timeSlot.bookings.filter(b => b.status === "pending");
  const allActiveBookings = [...confirmedBookings, ...pendingBookings];

  const getSlotStatus = () => {
    if (isBlocked) return "blocked";
    if (isFull) return "full";
    if (timeSlot.availableSpots === 1) return "almost-full";
    return "available";
  };

  const statusStyles = {
    blocked: "bg-gray-200 dark:bg-gray-700 border-gray-300",
    full: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    "almost-full": "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
    available: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
  };

  const status = getSlotStatus();

  const handleCardClick = () => {
    if (!currentUser && !isBlocked && !isFull) {
      setPopoverOpen(true);
    }
  };

  const handleLoginClick = () => {
    setPopoverOpen(false);
    onLoginRequest();
  };

  const cardContent = (
    <Card
      className={cn(
        "p-4 transition-all duration-200 hover:shadow-md",
        !currentUser && !isBlocked && !isFull && "cursor-pointer",
        statusStyles[status],
        userBooking && "ring-2 ring-blue-500"
      )}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          <span className="font-semibold text-gray-900 dark:text-white">
            {timeSlot.time}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={status === "available" ? "default" : "secondary"}
            className="text-xs"
          >
            {status === "blocked" ? "Заблокировано" :
             status === "full" ? "Занято" :
             status === "almost-full" ? "Почти полно" : "Свободно"}
          </Badge>

          {!isBlocked && (
            <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
              <Users className="h-3 w-3" />
              <span>{confirmedBookings.length}/{timeSlot.maxCapacity}</span>
            </div>
          )}
        </div>
      </div>

      {/* Booking Info */}
      {!isBlocked && (
        <div className="space-y-2 mb-3">
          {isTrainer() ? (
            // Trainer view — show each student with cancel button
            <div className="space-y-2">
              {allActiveBookings.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Нет записей</p>
              )}
              {allActiveBookings.map((booking) => (
                <div
                  key={booking.id}
                  className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${
                    booking.status === "pending"
                      ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                      : "bg-white dark:bg-gray-900"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    {booking.status === "confirmed"
                      ? <UserCheck className="h-3 w-3 text-green-600 shrink-0" />
                      : <Clock className="h-3 w-3 text-yellow-600 shrink-0" />
                    }
                    <span className="text-gray-900 dark:text-white truncate">
                      {booking.student.firstName} {booking.student.lastName}
                    </span>
                    <Badge
                      variant={booking.status === "confirmed" ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {booking.status === "confirmed" ? "Записан" : "Заявка"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {booking.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onConfirm(booking.id)}
                        className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Подтвердить запись"
                        data-testid={`button-trainer-confirm-${booking.id}`}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCancel(booking.id)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Удалить запись"
                      data-testid={`button-trainer-cancel-${booking.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Student view
            <div className="space-y-2">
              {userBooking ? (
                userBooking.status === "pending" ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md">
                    <Clock className="h-4 w-4 text-yellow-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Заявка подана тренеру</p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">Ожидайте подтверждения</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-md">
                    <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">Вы записаны!</p>
                      <p className="text-xs text-green-600 dark:text-green-400">Тренер подтвердил запись</p>
                    </div>
                  </div>
                )
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {timeSlot.availableSpots > 0
                    ? `Свободных мест: ${timeSlot.availableSpots}`
                    : "Мест не осталось"}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trainer: Add student + block buttons */}
      {isTrainer() && !isBlocked && (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          {!isFull && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              onClick={() => onTrainerBook?.(timeSlot.id)}
              data-testid={`button-trainer-add-${timeSlot.id}`}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Записать ученика
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-gray-600 hover:bg-gray-100"
            onClick={() => blockMutation.mutate(true)}
            disabled={blockMutation.isPending}
            data-testid={`button-block-${timeSlot.id}`}
          >
            <Lock className="h-3 w-3 mr-1" />
            Заблокировать слот
          </Button>
        </div>
      )}

      {/* Student: own booking actions */}
      {!isBlocked && currentUser && !isTrainer() && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {userBooking ? (
            <div className="flex gap-2 w-full">
              {userBooking.status === "pending" && (
                <Badge variant="secondary" className="flex-1 justify-center">
                  Ждет подтверждения
                </Badge>
              )}
              {userBooking.status === "confirmed" && (
                <Badge variant="default" className="flex-1 justify-center">
                  Записан
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(userBooking.id)}
                className="text-red-600 hover:text-red-700"
                data-testid={`button-cancel-${timeSlot.id}`}
              >
                Отменить
              </Button>
            </div>
          ) : (
            !isFull && (
              <Button
                onClick={() => onBook(timeSlot.id)}
                className="flex-1"
                size="sm"
                data-testid={`button-book-${timeSlot.id}`}
              >
                Записаться
              </Button>
            )
          )}
        </div>
      )}

      {isBlocked && isTrainer() && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={(e) => { e.stopPropagation(); blockMutation.mutate(false); }}
          disabled={blockMutation.isPending}
          data-testid={`button-unblock-${timeSlot.id}`}
        >
          <Unlock className="h-3 w-3 mr-1" />
          Разблокировать
        </Button>
      )}
    </Card>
  );

  // Wrap with Popover only for guest users on available slots
  if (!currentUser && !isBlocked && !isFull) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          {cardContent}
        </PopoverTrigger>
        <PopoverContent className="w-72 p-4" side="top">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-blue-600" />
              <p className="font-semibold text-gray-900 dark:text-white">
                Нужен вход в систему
              </p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Чтобы записаться на <strong>{timeSlot.time}</strong>, войдите или зарегистрируйтесь.
            </p>
            <Button onClick={handleLoginClick} className="w-full" size="sm">
              <LogIn className="mr-2 h-4 w-4" />
              Войти / Зарегистрироваться
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return cardContent;
}
