import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type User } from "@shared/schema";
import { BookStudentDialog } from "./book-student-dialog";
import { Users, Search, Phone, UserCheck, Clock, Loader2, Calendar } from "lucide-react";
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

  const { data: students = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/trainer/students"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/trainer/students");
      return response.json();
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: true
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
                <div key={student.id} className="border rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          <span>С {format(new Date(student.createdAt), "d MMM yyyy", { locale: ru })}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleBookStudent(student)}
                      className="ml-2 shrink-0"
                      data-testid={`button-book-student-${student.id}`}
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      Записать
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <BookStudentDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        preselectedStudent={selectedStudent}
      />
    </>
  );
}
