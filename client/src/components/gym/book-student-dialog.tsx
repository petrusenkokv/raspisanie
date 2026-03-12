import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { useToast } from "@/hooks/use-toast";
import { type User } from "@shared/schema";
import { Calendar, UserCheck, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface BookStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // If timeSlotId is passed — skip date/time selection (booking from a specific slot)
  preselectedTimeSlotId?: string | null;
  // If student is passed — skip student selection (booking from student card)
  preselectedStudent?: User | null;
}

export function BookStudentDialog({
  open,
  onOpenChange,
  preselectedTimeSlotId,
  preselectedStudent
}: BookStudentDialogProps) {
  const { currentUser, schedule } = useGymStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState(preselectedTimeSlotId || "");

  const { data: students = [] } = useQuery<User[]>({
    queryKey: ["/api/trainer/students"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/trainer/students");
      return res.json();
    },
    enabled: open && !preselectedStudent,
    staleTime: 0
  });

  const bookMutation = useMutation({
    mutationFn: async ({ studentId, timeSlotId }: { studentId: string; timeSlotId: string }) => {
      const res = await apiRequest("POST", "/api/trainer/book-student", {
        studentId,
        timeSlotId,
        trainerId: currentUser?.id
      });
      return res.json();
    },
    onSuccess: () => {
      const student = preselectedStudent || students.find(s => s.id === selectedStudentId);
      toast({
        title: "Ученик записан",
        description: student ? `${student.firstName} ${student.lastName} записан на занятие` : "Ученик записан"
      });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      handleClose();
    },
    onError: () => {
      toast({ variant: "destructive", title: "Ошибка", description: "Не удалось записать ученика" });
    }
  });

  const handleClose = () => {
    setSearchQuery("");
    setSelectedStudentId("");
    setSelectedDate("");
    setSelectedTimeSlotId(preselectedTimeSlotId || "");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    const studentId = preselectedStudent?.id || selectedStudentId;
    const slotId = preselectedTimeSlotId || selectedTimeSlotId;
    if (studentId && slotId) {
      bookMutation.mutate({ studentId, timeSlotId: slotId });
    }
  };

  // Available dates from schedule (with free spots)
  const availableDates = schedule
    .filter(day => day.timeSlots.some((ts: any) => ts.availableSpots > 0 && !ts.isBlocked))
    .map(day => day.date);

  const availableSlots = selectedDate
    ? (schedule.find(day => day.date === selectedDate)?.timeSlots || [])
        .filter((ts: any) => ts.availableSpots > 0 && !ts.isBlocked)
    : [];

  const filteredStudents = students.filter(s => {
    const q = searchQuery.toLowerCase();
    return (
      s.firstName.toLowerCase().includes(q) ||
      (s.lastName || "").toLowerCase().includes(q) ||
      s.phone.includes(q)
    );
  });

  const selectedSlotLabel = preselectedTimeSlotId
    ? (() => {
        for (const day of schedule) {
          const slot = day.timeSlots.find((ts: any) => ts.id === preselectedTimeSlotId);
          if (slot) return `${format(new Date(day.date + "T00:00:00"), "d MMMM", { locale: ru })}, ${slot.time}`;
        }
        return "";
      })()
    : "";

  const canConfirm =
    (preselectedStudent || selectedStudentId) &&
    (preselectedTimeSlotId || selectedTimeSlotId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Записать ученика
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student selection (if not preselected) */}
          {preselectedStudent ? (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <UserCheck className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {preselectedStudent.firstName} {preselectedStudent.lastName}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{preselectedStudent.phone}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Выберите ученика</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Поиск..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите ученика..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredStudents.length === 0 ? (
                    <SelectItem value="none" disabled>Нет учеников</SelectItem>
                  ) : (
                    filteredStudents.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} — {s.phone}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time slot selection (if not preselected) */}
          {preselectedTimeSlotId ? (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Время:</span> {selectedSlotLabel}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Дата</Label>
                <Select
                  value={selectedDate}
                  onValueChange={(v) => { setSelectedDate(v); setSelectedTimeSlotId(""); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите дату..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDates.length === 0 ? (
                      <SelectItem value="none" disabled>Нет доступных дат</SelectItem>
                    ) : (
                      availableDates.map((date: string) => (
                        <SelectItem key={date} value={date}>
                          {format(new Date(date + "T00:00:00"), "d MMMM yyyy (EEEE)", { locale: ru })}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedDate && (
                <div className="space-y-2">
                  <Label>Время</Label>
                  <Select value={selectedTimeSlotId} onValueChange={setSelectedTimeSlotId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите время..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSlots.map((ts: any) => (
                        <SelectItem key={ts.id} value={ts.id}>
                          {ts.time} — свободно мест: {ts.availableSpots}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={bookMutation.isPending} className="flex-1">
              Отмена
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || bookMutation.isPending}
              className="flex-1"
              data-testid="button-confirm-booking"
            >
              {bookMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Записать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
