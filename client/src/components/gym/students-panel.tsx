import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { useToast } from "@/hooks/use-toast";
import { type User } from "@shared/schema";
import { 
  Users, Search, Phone, Calendar, UserCheck, 
  Clock, Loader2, ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface StudentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentsPanel({ open, onOpenChange }: StudentsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const { currentUser, schedule } = useGymStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: students = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/trainer/students"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/trainer/students");
      return response.json();
    },
    enabled: open
  });

  const bookStudentMutation = useMutation({
    mutationFn: async ({ studentId, timeSlotId }: { studentId: string; timeSlotId: string }) => {
      const response = await apiRequest("POST", "/api/trainer/book-student", {
        studentId,
        timeSlotId,
        trainerId: currentUser?.id
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Ученик записан",
        description: `${selectedStudent?.firstName} ${selectedStudent?.lastName} записан на занятие`
      });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setBookingDialogOpen(false);
      setSelectedStudent(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось записать ученика"
      });
    }
  });

  const filteredStudents = students.filter(student => {
    const query = searchQuery.toLowerCase();
    return (
      student.firstName.toLowerCase().includes(query) ||
      (student.lastName || "").toLowerCase().includes(query) ||
      student.phone.includes(query)
    );
  });

  const handleBookStudent = (student: User) => {
    setSelectedStudent(student);
    setBookingDialogOpen(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:w-[420px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Список учеников
            </SheetTitle>
          </SheetHeader>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Поиск по имени или телефону..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
            <UserCheck className="h-4 w-4" />
            <span>Всего учеников: <strong>{students.length}</strong></span>
          </div>

          {/* Students list */}
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {searchQuery ? "Ученики не найдены" : "Пока нет зарегистрированных учеников"}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  onBook={() => handleBookStudent(student)}
                />
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Booking dialog */}
      <BookStudentDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        student={selectedStudent}
        schedule={schedule}
        onBook={(timeSlotId) => {
          if (selectedStudent) {
            bookStudentMutation.mutate({ studentId: selectedStudent.id, timeSlotId });
          }
        }}
        isPending={bookStudentMutation.isPending}
      />
    </>
  );
}

function StudentCard({ student, onBook }: { student: User; onBook: () => void }) {
  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-white">
              {student.firstName} {student.lastName}
            </span>
            <Badge variant="outline" className="text-xs">
              <UserCheck className="h-3 w-3 mr-1" />
              Ученик
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Phone className="h-3 w-3" />
            <span>{student.phone}</span>
          </div>

          {student.createdAt && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
              <Clock className="h-3 w-3" />
              <span>
                С нами с {format(new Date(student.createdAt), "d MMMM yyyy", { locale: ru })}
              </span>
            </div>
          )}
        </div>

        <Button
          size="sm"
          onClick={onBook}
          className="ml-2 shrink-0"
          data-testid={`button-book-student-${student.id}`}
        >
          <Calendar className="h-4 w-4 mr-1" />
          Записать
        </Button>
      </div>
    </div>
  );
}

interface BookStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: User | null;
  schedule: any[];
  onBook: (timeSlotId: string) => void;
  isPending: boolean;
}

function BookStudentDialog({ open, onOpenChange, student, schedule, onBook, isPending }: BookStudentDialogProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState("");

  const availableDates = schedule
    .filter(day => day.timeSlots.some((ts: any) => ts.availableSpots > 0 && !ts.isBlocked))
    .map(day => day.date);

  const availableSlots = selectedDate
    ? (schedule.find(day => day.date === selectedDate)?.timeSlots || [])
        .filter((ts: any) => ts.availableSpots > 0 && !ts.isBlocked)
    : [];

  const handleBook = () => {
    if (selectedTimeSlotId) {
      onBook(selectedTimeSlotId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Записать ученика
          </DialogTitle>
        </DialogHeader>

        {student && (
          <div className="space-y-4">
            {/* Student info */}
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <UserCheck className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {student.firstName} {student.lastName}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{student.phone}</p>
              </div>
            </div>

            {/* Date selection */}
            <div className="space-y-2">
              <Label>Выберите дату</Label>
              <Select
                value={selectedDate}
                onValueChange={(val) => { setSelectedDate(val); setSelectedTimeSlotId(""); }}
              >
                <SelectTrigger data-testid="select-date">
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

            {/* Time selection */}
            {selectedDate && (
              <div className="space-y-2">
                <Label>Выберите время</Label>
                <Select
                  value={selectedTimeSlotId}
                  onValueChange={setSelectedTimeSlotId}
                >
                  <SelectTrigger data-testid="select-time">
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

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="flex-1"
              >
                Отмена
              </Button>
              <Button
                onClick={handleBook}
                disabled={!selectedTimeSlotId || isPending}
                className="flex-1"
                data-testid="button-confirm-booking"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Записать
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
