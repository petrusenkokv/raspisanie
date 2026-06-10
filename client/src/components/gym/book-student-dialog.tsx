import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { useToast } from "@/hooks/use-toast";
import { type User, type TimeSlotWithBookings, type StudentWithConsents } from "@shared/schema";
import { Calendar, UserCheck, User as UserIcon, Loader2, Search, Dumbbell } from "lucide-react";
import { TrainerStudentConsentsManager } from "./trainer-student-consents-block";
import { TrainerStudentServiceSection } from "./trainer-student-service-section";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ToastAction } from "@/components/ui/toast";
import { RecurringBookingsPanel } from "./recurring-bookings-panel";

type StudentWithConsent = User & { pendingDocumentCount?: number };

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSlotInPast(date: string, time: string): boolean {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  const slotMs = new Date(`${date}T${t}:00+03:00`).getTime();
  return slotMs < Date.now();
}

interface BookStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedTimeSlotId?: string | null;
  preselectedStudent?: User | null;
  forceSelfMode?: boolean;
}

export function BookStudentDialog({
  open,
  onOpenChange,
  preselectedTimeSlotId,
  preselectedStudent,
  forceSelfMode = false,
}: BookStudentDialogProps) {
  const { currentUser, schedule } = useGymStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(todayLocalStr());
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState(preselectedTimeSlotId || "");
  const [bookingForSelf, setBookingForSelf] = useState(false);

  useEffect(() => {
    if (open && !preselectedTimeSlotId) {
      setSelectedDate(todayLocalStr());
      setSelectedTimeSlotId("");
    }
    if (open && forceSelfMode) {
      setBookingForSelf(true);
      setSelectedStudentId("");
    }
    if (!open) {
      setBookingForSelf(false);
      setSelectedStudentId("");
      setSearchQuery("");
    }
  }, [open, preselectedTimeSlotId, forceSelfMode]);

  const { data: students = [] } = useQuery<StudentWithConsent[]>({
    queryKey: ["/api/trainer/students"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/trainer/students");
      return res.json();
    },
    enabled: open && !preselectedStudent,
    staleTime: 0
  });

  const effectiveStudentId =
    !bookingForSelf && !forceSelfMode
      ? (preselectedStudent?.id || selectedStudentId || null)
      : null;

  const { data: studentDetail, isLoading: studentDetailLoading } = useQuery<StudentWithConsents>({
    queryKey: ["/api/trainer/students", effectiveStudentId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/trainer/students/${effectiveStudentId}`);
      return r.json();
    },
    enabled: open && !!effectiveStudentId,
    staleTime: 0,
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
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/day"] });
      handleClose();
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Ошибка", description: err?.message || "Не удалось записать ученика" });
    }
  });

  const bookSelfMutation = useMutation({
    mutationFn: async (timeSlotId: string) => {
      const res = await apiRequest("POST", "/api/trainer/book-self", { timeSlotId });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Ошибка записи");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Вы записаны", description: "Запись на тренировку подтверждена" });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/day"] });
      handleClose();
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Не удалось записаться", description: err?.message || "Ошибка записи" });
    },
  });

  const handleClose = () => {
    setSearchQuery("");
    setSelectedStudentId("");
    setSelectedDate(todayLocalStr());
    setSelectedTimeSlotId(preselectedTimeSlotId || "");
    onOpenChange(false);
  };

  const doBook = (studentId: string, slotId: string) => {
    bookMutation.mutate({ studentId, timeSlotId: slotId });
  };

  const handleConfirm = () => {
    const studentId = preselectedStudent?.id || selectedStudentId;
    const slotId = preselectedTimeSlotId || selectedTimeSlotId;
    if (!slotId) return;
    if (!bookingForSelf && !studentId) return;

    let slotDate: string | null = null;
    let slotTime: string | null = null;

    if (preselectedTimeSlotId) {
      for (const day of schedule) {
        const found = day.timeSlots.find((ts: TimeSlotWithBookings) => ts.id === preselectedTimeSlotId);
        if (found) {
          slotDate = day.date;
          slotTime = found.time;
          break;
        }
      }
    } else if (selectedDate && selectedTimeSlotId && dayData) {
      const found = dayData.timeSlots.find(ts => ts.id === selectedTimeSlotId);
      if (found) {
        slotDate = selectedDate;
        slotTime = found.time;
      }
    }

    if (slotDate && slotTime && isSlotInPast(slotDate, slotTime)) {
      const student = preselectedStudent || students.find(s => s.id === studentId);
      const dateLabel = format(new Date(slotDate + "T00:00:00"), "d MMMM", { locale: ru });
      const personLabel = bookingForSelf
        ? " себя"
        : `${student ? ` ${student.firstName} ${student.lastName}` : " ученика"}`;
      toast({
        title: "Запись на прошедшую дату",
        description: `Слот ${dateLabel}, ${slotTime} уже прошёл. Записать${personLabel} задним числом?`,
        action: (
          <ToastAction
            altText="Записать всё равно"
            onClick={() => {
              if (bookingForSelf) {
                bookSelfMutation.mutate(slotId);
                return;
              }
              if (studentId) doBook(studentId, slotId);
            }}
          >
            Записать всё равно
          </ToastAction>
        ),
      });
      return;
    }

    if (bookingForSelf) {
      bookSelfMutation.mutate(slotId);
      return;
    }
    if (studentId) doBook(studentId, slotId);
  };

  const { data: dayData, isLoading: dayLoading } = useQuery<{
    date: string;
    timeSlots: TimeSlotWithBookings[];
  }>({
    queryKey: ["schedule", "day", selectedDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/schedule/day/${selectedDate}`);
      return res.json();
    },
    enabled: open && !preselectedTimeSlotId && !!selectedDate,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const availableSlots = (dayData?.timeSlots || []).filter(
    (ts) => ts.availableSpots > 0 && !ts.isBlocked
  );

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

  const canConfirm = bookingForSelf
    ? !!(preselectedTimeSlotId || selectedTimeSlotId)
    : !!(preselectedStudent || selectedStudentId) && !!(preselectedTimeSlotId || selectedTimeSlotId);

  const isSelfTrainingMode = bookingForSelf || forceSelfMode;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {isSelfTrainingMode ? (
            <DialogTitle className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-emerald-600" />
              Тренировка — {currentUser?.firstName ?? "тренер"}
            </DialogTitle>
          ) : (
            <>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Запись на тренировку
              </DialogTitle>
              <DialogDescription>Запишите ученика или себя на свободный слот.</DialogDescription>
            </>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {!preselectedStudent && !forceSelfMode && (
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                type="button"
                onClick={() => { setBookingForSelf(false); setSelectedStudentId(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                  !bookingForSelf
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <UserIcon className="h-4 w-4" />
                Записать ученика
              </button>
              <button
                type="button"
                onClick={() => { setBookingForSelf(true); setSelectedStudentId(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
                  bookingForSelf
                    ? "bg-emerald-600 text-white"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Dumbbell className="h-4 w-4" />
                Записать себя
              </button>
            </div>
          )}

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
          ) : bookingForSelf ? (
            currentUser?.id ? (
              <RecurringBookingsPanel studentId={currentUser.id} />
            ) : null
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
                        {(s.pendingDocumentCount ?? 0) > 0 ? " ⚠" : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {effectiveStudentId && (
            studentDetailLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : studentDetail ? (
              <>
                <TrainerStudentServiceSection studentId={effectiveStudentId} />
                <TrainerStudentConsentsManager
                  studentId={effectiveStudentId}
                  consents={studentDetail.consents}
                  hint="Отметьте документы, подписанные на бумаге, перед записью на тренировку."
                />
              </>
            ) : null
          )}

          {preselectedTimeSlotId ? (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Время:</span> {selectedSlotLabel}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="book-date">Дата</Label>
                <Input
                  id="book-date"
                  type="date"
                  value={selectedDate}
                  min={todayLocalStr()}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedTimeSlotId("");
                  }}
                  data-testid="input-book-date"
                />
                {selectedDate && (
                  <p className="text-xs text-gray-500">
                    {format(new Date(selectedDate + "T00:00:00"), "d MMMM yyyy (EEEE)", { locale: ru })}
                  </p>
                )}
              </div>

              {selectedDate && (
                <div className="space-y-2">
                  <Label>Время</Label>
                  <Select value={selectedTimeSlotId} onValueChange={setSelectedTimeSlotId}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          dayLoading
                            ? "Загружаем..."
                            : availableSlots.length === 0
                            ? "Нет свободных слотов"
                            : "Выберите время..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSlots.length === 0 ? (
                        <SelectItem value="none" disabled>
                          {dayLoading ? "Загружаем..." : "Нет свободных слотов в этот день"}
                        </SelectItem>
                      ) : (
                        availableSlots.map((ts) => (
                          <SelectItem key={ts.id} value={ts.id}>
                            {ts.time} — свободно мест: {ts.availableSpots}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={bookMutation.isPending || bookSelfMutation.isPending}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || bookMutation.isPending || bookSelfMutation.isPending}
              className={`flex-1 ${bookingForSelf ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
              data-testid="button-confirm-booking"
            >
              {(bookMutation.isPending || bookSelfMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {bookingForSelf ? "Записать себя" : "Записать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
