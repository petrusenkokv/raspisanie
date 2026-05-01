import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, CalendarDays } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import type { TimeSlotWithBookings } from "@shared/schema";

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currentDate: string;
  currentTime: string;
  studentId: string;
}

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minutesUntilMoscow(date: string, time: string): number {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  const ms = new Date(`${date}T${t}:00+03:00`).getTime();
  return Math.round((ms - Date.now()) / 60_000);
}

export function RescheduleDialog({
  open,
  onOpenChange,
  bookingId,
  currentDate,
  currentTime,
  studentId,
}: RescheduleDialogProps) {
  const { currentUser, isTrainer } = useGymStore();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string>(() => todayLocalStr());
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const { data: slots = [], isFetching } = useQuery<TimeSlotWithBookings[]>({
    queryKey: ["/api/schedule/day", selectedDate, "slots"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/schedule/day/${selectedDate}`);
      const json = await r.json();
      return (json.timeSlots ?? []) as TimeSlotWithBookings[];
    },
    enabled: open && !!selectedDate,
    staleTime: 0,
  });

  const { data: scheduleSettings } = useQuery<{ bookingDeadlineHours?: number }>({
    queryKey: ["/api/schedule/settings"],
    staleTime: 60_000,
  });
  const bookingDeadlineH = scheduleSettings?.bookingDeadlineHours ?? 0;

  // Filter slots: not blocked, in future, has free space, not current slot, not same as existing student booking on that date
  const availableSlots = slots.filter((s) => {
    if (s.isBlocked) return false;
    const minsUntil = minutesUntilMoscow(s.date, s.time);
    if (minsUntil <= 0) return false;
    if (!isTrainer() && bookingDeadlineH > 0 && minsUntil <= bookingDeadlineH * 60) return false;
    // Skip the current slot
    if (s.date === currentDate && s.time.slice(0, 5) === currentTime.slice(0, 5)) return false;
    // Count active bookings in slot
    const active = (s.bookings ?? []).filter(
      (b: any) => b.status !== "cancelled" && (isTrainer() || b.studentId !== studentId)
    ).length;
    const studentAlreadyHere = (s.bookings ?? []).some(
      (b: any) => b.studentId === studentId && b.status !== "cancelled"
    );
    if (studentAlreadyHere) return false;
    return active < s.maxCapacity;
  });

  const rescheduleMutation = useMutation({
    mutationFn: async (newTimeSlotId: string) => {
      const r = await apiRequest("POST", `/api/bookings/${bookingId}/reschedule`, {
        newTimeSlotId,
        rescheduledBy: currentUser?.id,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message || "Не удалось перенести");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Запись перенесена" });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const currentTimeLabel = currentTime.slice(0, 5);
  const currentDateLabel = currentDate.split("-").reverse().join(".");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-500" />
            Перенести тренировку
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded px-3 py-2">
            <span className="font-medium text-gray-900 dark:text-white">
              {currentDateLabel} в {currentTimeLabel}
            </span>
            <ArrowRight className="h-4 w-4" />
            <span className="text-gray-500">новое время</span>
          </div>

          <div>
            <Label>Выберите дату</Label>
            <input
              type="date"
              className="w-full border rounded h-9 px-3 text-sm bg-background mt-1"
              value={selectedDate}
              min={todayLocalStr()}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedSlotId(null);
              }}
            />
          </div>

          <div>
            <Label>Доступные слоты</Label>
            {isFetching ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              </div>
            ) : availableSlots.length === 0 ? (
              <p className="text-sm text-gray-500 mt-2 text-center py-3">
                Нет свободных слотов на эту дату
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto">
                {availableSlots.map((s) => {
                  const active = (s.bookings ?? []).filter((b: any) => b.status !== "cancelled").length;
                  const free = s.maxCapacity - active;
                  const selected = selectedSlotId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSlotId(s.id)}
                      className={`border rounded px-2 py-2 text-sm font-medium transition-colors flex flex-col items-center gap-0.5 ${
                        selected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : "border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                      }`}
                    >
                      <span>{s.time.slice(0, 5)}</span>
                      <Badge variant="secondary" className="text-xs px-1 py-0">
                        {free}/{s.maxCapacity}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!isTrainer() && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-2">
              После переноса подтверждённая запись вернётся в статус «Заявка» и потребует повторного подтверждения тренера.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={!selectedSlotId || rescheduleMutation.isPending}
            onClick={() => selectedSlotId && rescheduleMutation.mutate(selectedSlotId)}
          >
            {rescheduleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Перенести
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
