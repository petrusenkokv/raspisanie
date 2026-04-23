import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type User } from "@shared/schema";
import { BookStudentDialog } from "./book-student-dialog";
import { Users, Search, Phone, UserCheck, Clock, Loader2, Calendar, UserPlus, Trash2 } from "lucide-react";
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);
  const [newStudent, setNewStudent] = useState({ firstName: "", lastName: "", phone: "", password: "12345" });
  const { toast } = useToast();

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

  const addMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; phone: string; password: string }) => {
      const response = await apiRequest("POST", "/api/trainer/students", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      toast({
        title: "Ученик добавлен",
        description: `Передайте ученику пароль для первого входа`,
      });
      setAddDialogOpen(false);
      setNewStudent({ firstName: "", lastName: "", phone: "", password: "12345" });
    },
    onError: (error: any) => {
      toast({
        title: "Не удалось добавить ученика",
        description: error?.message || "Попробуйте ещё раз",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/trainer/students/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule"] });
      toast({ title: "Ученик удалён" });
      setStudentToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Не удалось удалить",
        description: error?.message || "Попробуйте ещё раз",
        variant: "destructive",
      });
    },
  });

  const filteredStudents = students.filter(student => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const digitsQuery = query.replace(/\D/g, "");
    const phoneDigits = student.phone.replace(/\D/g, "");
    return (
      student.firstName.toLowerCase().includes(query) ||
      (student.lastName || "").toLowerCase().includes(query) ||
      (digitsQuery.length > 0 && phoneDigits.includes(digitsQuery))
    );
  });

  const handleBookStudent = (student: User) => {
    setSelectedStudent(student);
    setBookingDialogOpen(true);
  };

  const handleAddSubmit = () => {
    if (!newStudent.firstName.trim()) {
      toast({ title: "Укажите имя", variant: "destructive" });
      return;
    }
    if (newStudent.phone.replace(/\D/g, "").length < 10) {
      toast({ title: "Укажите корректный телефон", variant: "destructive" });
      return;
    }
    addMutation.mutate(newStudent);
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

          {/* Add student button */}
          <Button
            className="w-full mb-3"
            onClick={() => setAddDialogOpen(true)}
            data-testid="button-add-student"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Добавить ученика
          </Button>

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
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
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
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleBookStudent(student)}
                        data-testid={`button-book-student-${student.id}`}
                      >
                        <Calendar className="h-4 w-4 mr-1" />
                        Записать
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setStudentToDelete(student)}
                        data-testid={`button-delete-student-${student.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Удалить
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add student dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый ученик</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="new-firstName">Имя</Label>
              <Input
                id="new-firstName"
                value={newStudent.firstName}
                onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })}
                placeholder="Иван"
                data-testid="input-new-student-firstname"
              />
            </div>
            <div>
              <Label htmlFor="new-lastName">Фамилия</Label>
              <Input
                id="new-lastName"
                value={newStudent.lastName}
                onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })}
                placeholder="Иванов"
                data-testid="input-new-student-lastname"
              />
            </div>
            <div>
              <Label htmlFor="new-phone">Телефон</Label>
              <Input
                id="new-phone"
                value={newStudent.phone}
                onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })}
                placeholder="79991234567"
                data-testid="input-new-student-phone"
              />
            </div>
            <div>
              <Label htmlFor="new-password">Пароль для первого входа</Label>
              <Input
                id="new-password"
                value={newStudent.password}
                onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
                placeholder="12345"
                data-testid="input-new-student-password"
              />
              <p className="text-xs text-gray-500 mt-1">Ученик сможет сменить пароль после входа.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleAddSubmit}
              disabled={addMutation.isPending}
              data-testid="button-confirm-add-student"
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!studentToDelete} onOpenChange={(open) => !open && setStudentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить ученика?</AlertDialogTitle>
            <AlertDialogDescription>
              {studentToDelete && (
                <>Будут удалены все записи ученика <strong>{studentToDelete.firstName} {studentToDelete.lastName}</strong>. Это действие нельзя отменить.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => studentToDelete && deleteMutation.mutate(studentToDelete.id)}
              data-testid="button-confirm-delete-student"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookStudentDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        preselectedStudent={selectedStudent}
      />
    </>
  );
}
