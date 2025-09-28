import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Clock, Users, UserCheck } from "lucide-react";
import { type TimeSlotWithBookings } from "@shared/schema";
import { useGymStore } from "@/store/gym-store";
import { cn } from "@/lib/utils";

interface TimeSlotProps {
  timeSlot: TimeSlotWithBookings;
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string) => void;
}

export function TimeSlot({ timeSlot, onBook, onCancel }: TimeSlotProps) {
  const { currentUser, isTrainer } = useGymStore();
  
  const isFull = timeSlot.availableSpots === 0;
  const isBlocked = timeSlot.isBlocked;
  const canBook = !isFull && !isBlocked && currentUser;
  
  // Check if current user has a booking for this slot
  const userBooking = timeSlot.bookings.find(
    booking => booking.studentId === currentUser?.id && booking.status !== "cancelled"
  );
  
  const confirmedBookings = timeSlot.bookings.filter(b => b.status === "confirmed");
  const pendingBookings = timeSlot.bookings.filter(b => b.status === "pending");
  
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

  return (
    <Card className={cn(
      "p-4 transition-all duration-200 hover:shadow-md",
      statusStyles[status],
      userBooking && "ring-2 ring-blue-500"
    )}>
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
            // Trainer view - show student names
            <div className="space-y-1">
              {confirmedBookings.map((booking) => (
                <div key={booking.id} className="flex items-center gap-2 text-sm">
                  <UserCheck className="h-3 w-3 text-green-600" />
                  <span className="text-gray-900 dark:text-white">
                    {booking.student.firstName} {booking.student.lastName}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    Подтверждено
                  </Badge>
                </div>
              ))}
              {pendingBookings.map((booking) => (
                <div key={booking.id} className="flex items-center gap-2 text-sm">
                  <Clock className="h-3 w-3 text-yellow-600" />
                  <span className="text-gray-900 dark:text-white">
                    {booking.student.firstName} {booking.student.lastName}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    Ожидает
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            // Student view - show available spots only
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {timeSlot.availableSpots > 0 ? (
                <span>Свободных мест: {timeSlot.availableSpots}</span>
              ) : (
                <span>Мест не осталось</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {!isBlocked && currentUser && (
        <div className="flex gap-2">
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
            canBook && (
              <Button
                onClick={() => onBook(timeSlot.id)}
                disabled={!canBook}
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
          data-testid={`button-unblock-${timeSlot.id}`}
        >
          Разблокировать
        </Button>
      )}
    </Card>
  );
}