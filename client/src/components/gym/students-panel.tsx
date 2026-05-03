import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  type User,
  type Document,
  type StudentWithConsents,
  type RecurringBooking,
  type MembershipPayment,
  type TrainerPaymentWithUsage,
  type TrainerPaymentType,
} from "@shared/schema";
import { BookStudentDialog } from "./book-student-dialog";
import { DocumentViewDialog } from "./document-view-dialog";
import { DocumentsManagerDialog } from "./documents-manager-dialog";
import { Users, Search, Phone, UserCheck, Clock, Loader2, Calendar, UserPlus, Trash2, FileText, Eye, Edit, Activity, Heart, Wallet, Dumbbell, X, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface StudentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function calculateAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

const emptyNewStudent = {
  firstName: "",
  lastName: "",
  middleName: "",
  phone: "",
  password: "12345",
  birthDate: "",
  trainerNotes: "",
};

export function StudentsPanel({ open, onOpenChange }: StudentsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);
  const [studentToDeactivate, setStudentToDeactivate] = useState<User | null>(null);
  const [studentToReactivate, setStudentToReactivate] = useState<User | null>(null);
  const [reactivateResetCv, setReactivateResetCv] = useState(true);
  const [viewStudentId, setViewStudentId] = useState<string | null>(null);
  const [docsManagerOpen, setDocsManagerOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [newStudent, setNewStudent] = useState(emptyNewStudent);
  const [consentWarningStudent, setConsentWarningStudent] = useState<(User & { pendingDocumentCount: number }) | null>(null);
  const { toast } = useToast();

  const { data: students = [], isLoading } = useQuery<(User & { pendingDocumentCount: number })[]>({
    queryKey: ["/api/trainer/students", showInactive],
    queryFn: async () => {
      const url = showInactive ? "/api/trainer/students?includeInactive=true" : "/api/trainer/students";
      const response = await apiRequest("GET", url);
      return response.json();
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: true
  });

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/documents");
      return r.json();
    },
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
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
      setNewStudent(emptyNewStudent);
    },
    onError: (error: any) => {
      let description = "Попробуйте ещё раз";
      try {
        const raw = error?.message || "";
        const jsonPart = raw.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(jsonPart);
        if (parsed?.message) description = parsed.message;
      } catch {
        description = error?.message || description;
      }
      toast({
        title: "Не удалось добавить ученика",
        description,
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
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
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

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive, resetCv }: { id: string; isActive: boolean; resetCv?: boolean }) => {
      const r = await apiRequest("PATCH", `/api/trainer/students/${id}/status`, { isActive, resetCv: resetCv ?? false });
      return r.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", showInactive] });
      toast({ title: vars.isActive ? "Ученик восстановлен" : "Ученик приостановлен" });
      setStudentToDeactivate(null);
      setStudentToReactivate(null);
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const filteredStudents = students.filter(student => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const digitsQuery = query.replace(/\D/g, "");
    const phoneDigits = student.phone.replace(/\D/g, "");
    return (
      student.firstName.toLowerCase().includes(query) ||
      (student.lastName || "").toLowerCase().includes(query) ||
      ((student as any).middleName || "").toLowerCase().includes(query) ||
      (digitsQuery.length > 0 && phoneDigits.includes(digitsQuery))
    );
  });

  const handleBookStudent = (student: User & { pendingDocumentCount?: number }) => {
    if ((student.pendingDocumentCount ?? 0) > 0) {
      setConsentWarningStudent(student as User & { pendingDocumentCount: number });
    } else {
      setSelectedStudent(student);
      setBookingDialogOpen(true);
    }
  };

  const handleBookStudentForce = () => {
    if (consentWarningStudent) {
      setSelectedStudent(consentWarningStudent);
      setConsentWarningStudent(null);
      setBookingDialogOpen(true);
    }
  };

  const handleAddSubmit = () => {
    if (!newStudent.firstName.trim() || !newStudent.lastName.trim()) {
      toast({ title: "Укажите фамилию и имя", variant: "destructive" });
      return;
    }
    if (newStudent.phone.replace(/\D/g, "").length < 10) {
      toast({ title: "Укажите корректный телефон", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      ...newStudent,
      consentDocumentIds: [],
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:w-[440px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Список учеников
            </SheetTitle>
          </SheetHeader>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <Button
              onClick={() => setAddDialogOpen(true)}
              data-testid="button-add-student"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
            <Button
              variant="outline"
              onClick={() => setDocsManagerOpen(true)}
              data-testid="button-manage-documents"
            >
              <FileText className="h-4 w-4 mr-2" />
              Документы
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Поиск по имени или телефону..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Stats + inactive toggle */}
          <div className="flex items-center justify-between mb-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              <span>Учеников: <strong>{filteredStudents.length}</strong></span>
            </div>
            <button
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                showInactive
                  ? "bg-gray-200 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-200"
                  : "bg-transparent text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
              onClick={() => setShowInactive(v => !v)}
            >
              {showInactive ? "Скрыть архив" : "Показать архив"}
            </button>
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
              {filteredStudents.map((student) => {
                const age = calculateAge((student as any).birthDate);
                const isInactive = (student as any).isActive === false;
                const hasPendingDocs = (student.pendingDocumentCount ?? 0) > 0;
                return (
                  <div key={student.id} className={`border rounded-lg p-4 transition-shadow ${
                    isInactive
                      ? "bg-gray-50 dark:bg-gray-900 opacity-70 border-dashed"
                      : hasPendingDocs
                        ? "bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-700 hover:shadow-sm"
                        : "bg-white dark:bg-gray-800 hover:shadow-sm"
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 hover:underline text-left"
                            onClick={() => setViewStudentId(student.id)}
                            data-testid={`button-view-student-${student.id}`}
                          >
                            {student.lastName} {student.firstName} {(student as any).middleName || ""}
                          </button>
                          {isInactive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400">
                              архив
                            </span>
                          )}
                          {hasPendingDocs && !isInactive && (
                            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-700">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Документы не приняты
                            </span>
                          )}
                          {age !== null && (
                            <Badge variant="secondary" className="text-xs">
                              {age} {age === 1 ? "год" : age >= 2 && age <= 4 ? "года" : "лет"}
                            </Badge>
                          )}
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
                        {!isInactive && (
                          <Button
                            size="sm"
                            onClick={() => handleBookStudent(student)}
                            data-testid={`button-book-student-${student.id}`}
                          >
                            <Calendar className="h-4 w-4 mr-1" />
                            Записать
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewStudentId(student.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Карточка
                        </Button>
                        {isInactive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => { setStudentToReactivate(student); setReactivateResetCv(true); }}
                          >
                            <UserCheck className="h-4 w-4 mr-1" />
                            Восстановить
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={() => setStudentToDeactivate(student)}
                            data-testid={`button-deactivate-student-${student.id}`}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Приостановить
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 text-xs"
                          onClick={() => setStudentToDelete(student)}
                          data-testid={`button-delete-student-${student.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Удалить совсем
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add student dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новый ученик</DialogTitle>
            <DialogDescription>Добавление нового ученика в список.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
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
                <Label htmlFor="new-firstName">Имя</Label>
                <Input
                  id="new-firstName"
                  value={newStudent.firstName}
                  onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })}
                  placeholder="Иван"
                  data-testid="input-new-student-firstname"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="new-middleName">Отчество (если есть)</Label>
              <Input
                id="new-middleName"
                value={newStudent.middleName}
                onChange={(e) => setNewStudent({ ...newStudent, middleName: e.target.value })}
                placeholder="Иванович"
              />
            </div>
            <div>
              <Label htmlFor="new-birthDate">Дата рождения</Label>
              <Input
                id="new-birthDate"
                type="date"
                value={newStudent.birthDate}
                onChange={(e) => setNewStudent({ ...newStudent, birthDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-phone">Телефон ученика</Label>
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
            <div>
              <Label htmlFor="new-notes">Заметки тренера</Label>
              <Textarea
                id="new-notes"
                value={newStudent.trainerNotes}
                onChange={(e) => setNewStudent({ ...newStudent, trainerNotes: e.target.value })}
                placeholder="Травмы, цели, пожелания..."
                rows={3}
              />
            </div>

            {documents.length > 0 && (
              <div className="border rounded-lg p-3 space-y-1.5 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Документы для подписи</p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Ученик самостоятельно ознакомится и подпишет следующие документы при первом входе в приложение:
                </p>
                <ul className="space-y-1">
                  {documents.map(doc => (
                    <li key={doc.id} className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      <button
                        type="button"
                        className="underline hover:text-blue-900 dark:hover:text-blue-200"
                        onClick={() => setViewingDoc(doc)}
                      >
                        {doc.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

      {/* Consent warning before booking */}
      <AlertDialog open={!!consentWarningStudent} onOpenChange={(open) => !open && setConsentWarningStudent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Документы не приняты
            </AlertDialogTitle>
            <AlertDialogDescription>
              {consentWarningStudent && (
                <>
                  <strong>{consentWarningStudent.firstName} {consentWarningStudent.lastName}</strong> не согласился с документами.
                  {" "}Ученику необходимо войти в приложение и принять все документы.
                  <br /><br />
                  Всё равно записать на занятие?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600"
              onClick={handleBookStudentForce}
            >
              Всё равно записать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Deactivate confirmation */}
      <AlertDialog open={!!studentToDeactivate} onOpenChange={(open) => !open && setStudentToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Приостановить ученика?</AlertDialogTitle>
            <AlertDialogDescription>
              {studentToDeactivate && (
                <><strong>{studentToDeactivate.firstName} {studentToDeactivate.lastName}</strong> будет перемещён в архив. Данные и история сохранятся. Ученика можно восстановить в любой момент.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600"
              onClick={() => studentToDeactivate && statusMutation.mutate({ id: studentToDeactivate.id, isActive: false })}
            >
              Приостановить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate dialog */}
      <AlertDialog open={!!studentToReactivate} onOpenChange={(open) => !open && setStudentToReactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Восстановить ученика?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {studentToReactivate && (
                  <><strong>{studentToReactivate.firstName} {studentToReactivate.lastName}</strong> снова станет активным учеником.</>
                )}
                <div className="mt-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={reactivateResetCv}
                      onChange={(e) => setReactivateResetCv(e.target.checked)}
                    />
                    <span className="text-sm">
                      Сбросить счётчик ЧВ — следующая отметка доступна сразу после восстановления (рекомендуется при долгом перерыве)
                    </span>
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => studentToReactivate && statusMutation.mutate({ id: studentToReactivate.id, isActive: true, resetCv: reactivateResetCv })}
            >
              Восстановить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookStudentDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        preselectedStudent={selectedStudent}
      />

      <StudentCardDialog
        studentId={viewStudentId}
        open={!!viewStudentId}
        onOpenChange={(o) => !o && setViewStudentId(null)}
      />

      <DocumentsManagerDialog
        open={docsManagerOpen}
        onOpenChange={setDocsManagerOpen}
      />

      <DocumentViewDialog
        document={viewingDoc}
        open={!!viewingDoc}
        onOpenChange={(o) => !o && setViewingDoc(null)}
      />
    </>
  );
}

// ----- Student card dialog (view & edit) -----
interface StudentCardDialogProps {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function StudentCardDialog({ studentId, open, onOpenChange }: StudentCardDialogProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: student, isLoading } = useQuery<StudentWithConsents>({
    queryKey: ["/api/trainer/students", studentId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/trainer/students/${studentId}`);
      return r.json();
    },
    enabled: !!studentId && open,
    staleTime: 0,
  });

  useEffect(() => {
    if (student) {
      setForm({
        firstName: student.firstName || "",
        lastName: student.lastName || "",
        middleName: student.middleName || "",
        birthDate: student.birthDate || "",
        trainerNotes: student.trainerNotes || "",
      });
      setEditing(false);
    }
  }, [student]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiRequest("PATCH", `/api/trainer/students/${studentId}`, data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId] });
      toast({ title: "Сохранено" });
      setEditing(false);
    },
    onError: (e: any) => {
      toast({ title: "Не удалось сохранить", description: e?.message, variant: "destructive" });
    },
  });

  const age = calculateAge(student?.birthDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Карточка ученика</DialogTitle>
          <DialogDescription>Просмотр и редактирование данных ученика.</DialogDescription>
        </DialogHeader>
        {isLoading || !student ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : !editing ? (
          <div className="space-y-3 text-sm">
            <Field label="ФИО" value={`${student.lastName || ""} ${student.firstName} ${student.middleName || ""}`.trim()} />
            <Field label="Телефон" value={student.phone} />
            <Field
              label="Дата рождения"
              value={student.birthDate ? `${format(new Date(student.birthDate), "d MMMM yyyy", { locale: ru })}${age !== null ? ` (${age} лет)` : ""}` : "—"}
            />
            <Field label="Заметки тренера" value={student.trainerNotes || "—"} multiline />
            {(() => {
              const s = student as any;
              const hasMother = s.motherFullName || s.motherPhone;
              const hasFather = s.fatherFullName || s.fatherPhone;
              const hasLegacyParent = student.parentFullName || student.parentPhone;
              const hasAny = hasMother || hasFather || hasLegacyParent;
              const isMinor = age !== null && age < 14;
              if (!hasAny && !isMinor) return null;
              return (
                <div className="border rounded p-3 bg-amber-50 dark:bg-amber-950/20 space-y-3">
                  <p className="font-medium text-sm flex items-center gap-1.5">
                    Законные представители
                    {isMinor && <span className="text-xs font-normal text-amber-700 dark:text-amber-400">(ученик до 14 лет)</span>}
                  </p>
                  {hasMother && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Мать</p>
                      <Field label="ФИО" value={s.motherFullName || "—"} />
                      <Field label="Телефон" value={s.motherPhone || "—"} />
                    </div>
                  )}
                  {hasFather && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Отец</p>
                      <Field label="ФИО" value={s.fatherFullName || "—"} />
                      <Field label="Телефон" value={s.fatherPhone || "—"} />
                    </div>
                  )}
                  {hasLegacyParent && !hasMother && !hasFather && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Представитель</p>
                      <Field label="ФИО" value={student.parentFullName || "—"} />
                      <Field label="Телефон" value={student.parentPhone || "—"} />
                    </div>
                  )}
                  {!hasAny && isMinor && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Данные не заполнены. Родитель может добавить их в разделе «Мой профиль» в приложении.
                    </p>
                  )}
                </div>
              );
            })()}
            <div className="border rounded p-3 space-y-2">
              <p className="font-medium">Принятые документы</p>
              {student.consents.length === 0 ? (
                <p className="text-gray-500">Документы не приняты</p>
              ) : (
                student.consents.map(c => (
                  <div key={c.id} className="text-xs">
                    ✓ {c.document.title} —{" "}
                    {c.acceptedAt ? format(new Date(c.acceptedAt), "d MMM yyyy", { locale: ru }) : ""}
                  </div>
                ))
              )}
            </div>
            <AttendanceSection studentId={student.id} />
            <PaymentsSection studentId={student.id} />
            <SickLeaveSection student={student} />
            <RecurringBookingsSection studentId={student.id} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
              <Button onClick={() => setEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Редактировать
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Фамилия</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div>
                <Label>Имя</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Отчество</Label>
              <Input value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
            </div>
            <div>
              <Label>Дата рождения</Label>
              <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            </div>
            <div>
              <Label>Заметки тренера</Label>
              <Textarea
                rows={4}
                value={form.trainerNotes}
                onChange={(e) => setForm({ ...form, trainerNotes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(false)}>Отмена</Button>
              <Button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Сохранить
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={multiline ? "whitespace-pre-wrap" : ""}>{value}</div>
    </div>
  );
}

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function todayLocalStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function RecurringBookingsSection({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [hour, setHour] = useState<number>(18);
  const [startDate, setStartDate] = useState<string>(todayLocalStr());
  const [endDate, setEndDate] = useState<string>("");

  const { data: rules = [], isLoading } = useQuery<RecurringBooking[]>({
    queryKey: ["/api/trainer/recurring", studentId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/trainer/recurring/${studentId}`);
      return r.json();
    },
    enabled: !!studentId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/trainer/recurring", {
        studentId,
        weekdays,
        hour,
        startDate,
        endDate: endDate || null,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/recurring", studentId] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Повторяющаяся запись создана" });
      setWeekdays([]);
      setEndDate("");
    },
    onError: (e: any) => toast({ title: "Не удалось создать", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/trainer/recurring/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/recurring", studentId] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Правило удалено", description: "Будущие записи отменены" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const toggleDay = (iso: number) => {
    setWeekdays((prev) => prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort());
  };

  return (
    <div className="border rounded p-3 space-y-3">
      <p className="font-medium text-sm flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        Повторяющиеся записи
      </p>

      {isLoading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : rules.length === 0 ? (
        <p className="text-xs text-gray-500">Нет регулярных тренировок</p>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-800 rounded p-2">
              <div className="space-y-1">
                <div>
                  <span className="font-medium">
                    {r.weekdays.slice().sort().map((d) => WEEKDAY_LABELS[d - 1]).join(", ")}
                  </span>{" "}
                  в {String(r.hour).padStart(2, "0")}:00
                </div>
                <div className="text-gray-500">
                  с {format(new Date(r.startDate), "d MMM yyyy", { locale: ru })}
                  {r.endDate ? ` по ${format(new Date(r.endDate), "d MMM yyyy", { locale: ru })}` : " (бессрочно)"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (confirm("Удалить правило? Все будущие записи будут отменены.")) {
                    deleteMutation.mutate(r.id);
                  }
                }}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-recurring-${r.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <p className="text-xs font-medium">Добавить правило</p>
        <div>
          <Label className="text-xs">Дни недели</Label>
          <div className="flex gap-1 mt-1 flex-wrap">
            {WEEKDAY_LABELS.map((label, i) => {
              const iso = i + 1;
              const active = weekdays.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDay(iso)}
                  className={`px-2 py-1 text-xs rounded border transition ${
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white dark:bg-gray-900 border-gray-300 hover:bg-gray-100"
                  }`}
                  data-testid={`button-weekday-${iso}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Час</Label>
            <select
              className="w-full text-sm border rounded px-2 py-1 bg-white dark:bg-gray-900"
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              data-testid="select-recurring-hour"
            >
              {Array.from({ length: 12 }).map((_, i) => {
                const h = 8 + i;
                return <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>;
              })}
            </select>
          </div>
          <div>
            <Label className="text-xs">С</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm"
              data-testid="input-recurring-start"
            />
          </div>
          <div>
            <Label className="text-xs">По (необяз.)</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm"
              data-testid="input-recurring-end"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || weekdays.length === 0 || !startDate}
          data-testid="button-create-recurring"
        >
          {createMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
          Создать правило
        </Button>
      </div>
    </div>
  );
}

type AttendanceStats = {
  total: number;
  attended: number;
  late: number;
  excused: number;
  noShow: number;
  pending: number;
};

function AttendanceSection({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery<AttendanceStats>({
    queryKey: ["/api/trainer/students", studentId, "attendance-stats"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/trainer/students/${studentId}/attendance-stats`);
      return r.json();
    },
    enabled: !!studentId,
  });

  const total = data?.total ?? 0;
  const attendedTotal = (data?.attended ?? 0) + (data?.late ?? 0);
  const attendedPct = total > 0 ? Math.round((attendedTotal / total) * 100) : null;

  return (
    <div className="border rounded p-3 space-y-2">
      <p className="font-medium text-sm flex items-center gap-2">
        <Activity className="h-4 w-4" />
        Посещаемость
      </p>
      {isLoading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : !data || total === 0 ? (
        <p className="text-xs text-gray-500">Пока нет состоявшихся занятий</p>
      ) : (
        <>
          {attendedPct !== null && (
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Посещаемость: <span className="font-semibold">{attendedPct}%</span> (за всё время)
            </div>
          )}
          <div className="grid grid-cols-2 gap-1 text-xs">
            <Stat label="Пришёл" value={data.attended} color="text-green-600" />
            <Stat label="Опоздал" value={data.late} color="text-yellow-600" />
            <Stat label="Уваж. причина" value={data.excused} color="text-blue-600" />
            <Stat label="Прогулы" value={data.noShow} color="text-red-600" />
            {data.pending > 0 && (
              <div className="col-span-2 text-xs text-gray-500 pt-1 border-t">
                Не отмечено: <span className="font-medium">{data.pending}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function SickLeaveSection({ student }: { student: User }) {
  const { toast } = useToast();
  const [until, setUntil] = useState<string>(student.sickUntil || "");
  const [note, setNote] = useState<string>(student.sickNote || "");

  useEffect(() => {
    setUntil(student.sickUntil || "");
    setNote(student.sickNote || "");
  }, [student.id, student.sickUntil, student.sickNote]);

  const setMutation = useMutation({
    mutationFn: async (payload: { sickUntil: string | null; sickNote: string | null }) => {
      const r = await apiRequest("PATCH", `/api/trainer/students/${student.id}/sick-leave`, payload);
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      const cancelled = data?.cancelledCount ?? 0;
      toast({
        title: data?.user?.sickUntil ? "Ученик отмечен как болеющий" : "Болезнь снята",
        description: cancelled > 0 ? `Отменено будущих записей: ${cancelled}` : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const isSick = !!student.sickUntil;

  return (
    <div className={`border rounded p-3 space-y-2 ${isSick ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900" : ""}`}>
      <p className="font-medium text-sm flex items-center gap-2">
        <Heart className={`h-4 w-4 ${isSick ? "text-rose-600" : ""}`} />
        Больничный
      </p>
      {isSick && (
        <div className="text-xs text-rose-700 dark:text-rose-300">
          Сейчас на больничном до{" "}
          <span className="font-semibold">
            {format(new Date(student.sickUntil!), "d MMMM yyyy", { locale: ru })}
          </span>
          {student.sickNote && <div className="text-gray-600 dark:text-gray-300 mt-1">{student.sickNote}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Болеет до</Label>
          <Input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="text-sm"
            data-testid="input-sick-until"
          />
        </div>
        <div>
          <Label className="text-xs">Причина (необяз.)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ОРВИ"
            className="text-sm"
            data-testid="input-sick-note"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => setMutation.mutate({ sickUntil: until || null, sickNote: note || null })}
          disabled={setMutation.isPending || !until}
          data-testid="button-set-sick"
        >
          {setMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
          {isSick ? "Обновить" : "Отметить"}
        </Button>
        {isSick && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMutation.mutate({ sickUntil: null, sickNote: null })}
            disabled={setMutation.isPending}
            data-testid="button-clear-sick"
          >
            Выздоровел
          </Button>
        )}
      </div>
      <p className="text-[11px] text-gray-500">
        При установке больничного все будущие записи в указанном периоде отменяются с пометкой «уважительная причина».
      </p>
    </div>
  );
}

// ====== Payments section ======
const TRAINER_TYPE_LABELS: Record<TrainerPaymentType, string> = {
  single: "Разовая",
  weekly: "Неделя",
  monthly: "Месяц",
};

const TRAINER_TYPE_DEFAULT_SESSIONS: Record<TrainerPaymentType, number> = {
  single: 1,
  weekly: 2,
  monthly: 8,
};

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(yyyymm: string): string {
  if (!yyyymm) return "";
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  return format(new Date(y, m - 1, 1), "LLLL yyyy", { locale: ru });
}

function PaymentsSection({ studentId }: { studentId: string }) {
  return (
    <div className="border rounded p-3 space-y-3">
      <p className="font-medium text-sm flex items-center gap-2">
        <Wallet className="h-4 w-4" />
        Оплаты
      </p>
      <MembershipSubsection studentId={studentId} />
      <TrainerSubscriptionSubsection studentId={studentId} />
    </div>
  );
}

function MembershipSubsection({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const [type, setType] = useState<"monthly_cv" | "one_time_bv">("monthly_cv");
  const [paidDate, setPaidDate] = useState<string>(todayLocalStr());
  const [date, setDate] = useState<string>(todayLocalStr());
  const [note, setNote] = useState<string>("");

  const { data: payments = [], isLoading } = useQuery<MembershipPayment[]>({
    queryKey: ["/api/trainer/students", studentId, "membership-payments"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/trainer/students/${studentId}/membership-payments`);
      return r.json();
    },
    enabled: !!studentId,
  });

  const { data: nextCvData } = useQuery<{ nextAllowedDate: string | null }>({
    queryKey: ["/api/trainer/students", studentId, "next-cv-date"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/trainer/students/${studentId}/next-cv-date`);
      return r.json();
    },
    enabled: !!studentId,
  });

  const nextAllowedDate = nextCvData?.nextAllowedDate ?? null;
  const today = todayLocalStr();
  const cvBlocked = type === "monthly_cv" && nextAllowedDate !== null && today < nextAllowedDate;

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload =
        type === "monthly_cv"
          ? { type, paidDate, note: note || null }
          : { type, date, note: note || null };
      const r = await apiRequest("POST", `/api/trainer/students/${studentId}/membership-payments`, payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "membership-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "next-cv-date"] });
      queryClient.invalidateQueries({ queryKey: ["payment-status"] });
      setNote("");
      toast({ title: type === "monthly_cv" ? "ЧВ отмечен" : "БВ отмечен" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/trainer/membership-payments/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "membership-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "next-cv-date"] });
      queryClient.invalidateQueries({ queryKey: ["payment-status"] });
      toast({ title: "Оплата удалена" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const hasCvCurrentMonth = payments.some(p => p.type === "monthly_cv" && p.month === currentMonthStr());

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Зал — членский взнос
        </p>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border ${
            hasCvCurrentMonth
              ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
              : "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
          }`}
          data-testid="badge-cv-current-month"
        >
          {hasCvCurrentMonth
            ? `ЧВ за ${monthLabel(currentMonthStr())} оплачен`
            : `ЧВ за ${monthLabel(currentMonthStr())} не оплачен`}
        </span>
      </div>

      {nextAllowedDate && (
        <p className={`text-[11px] rounded px-2 py-1 border ${
          cvBlocked
            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
            : "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
        }`}>
          {cvBlocked
            ? `Следующая отметка ЧВ доступна с ${format(new Date(nextAllowedDate + "T00:00:00"), "d MMMM yyyy", { locale: ru })}`
            : `Отметка ЧВ доступна с ${format(new Date(nextAllowedDate + "T00:00:00"), "d MMMM yyyy", { locale: ru })}`
          }
        </p>
      )}

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs">Тип</Label>
          <select
            className="w-full text-sm border rounded px-2 py-1 bg-background"
            value={type}
            onChange={(e) => setType(e.target.value as "monthly_cv" | "one_time_bv")}
            data-testid="select-membership-type"
          >
            <option value="monthly_cv">ЧВ (месяц)</option>
            <option value="one_time_bv">БВ (разово)</option>
          </select>
        </div>
        {type === "monthly_cv" ? (
          <div className="flex-1">
            <Label className="text-xs">Дата оплаты учеником</Label>
            <Input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="text-sm"
              data-testid="input-cv-paid-date"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">
              Засчитается за {paidDate ? monthLabel(paidDate.slice(0, 7)) : "—"}
            </p>
          </div>
        ) : (
          <div className="flex-1">
            <Label className="text-xs">Дата</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm"
              data-testid="input-bv-date"
            />
          </div>
        )}
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Примечание (необязательно)"
        className="text-sm"
        data-testid="input-membership-note"
      />
      <Button
        size="sm"
        className="w-full"
        onClick={() => addMutation.mutate()}
        disabled={addMutation.isPending || cvBlocked || (type === "monthly_cv" ? !paidDate : !date)}
        data-testid="button-add-membership"
        title={cvBlocked && nextAllowedDate ? `Доступно с ${nextAllowedDate}` : undefined}
      >
        {addMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
        Отметить оплату
      </Button>

      {isLoading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : payments.length === 0 ? (
        <p className="text-xs text-gray-500">Оплат пока нет.</p>
      ) : (
        <div className="space-y-1">
          {payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-xs border rounded px-2 py-1 bg-gray-50 dark:bg-gray-800"
              data-testid={`row-membership-${p.id}`}
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {p.type === "monthly_cv"
                    ? `ЧВ за ${monthLabel(p.month || "")}${
                        p.paidDate
                          ? ` — оплачен ${format(new Date(p.paidDate), "d MMM yyyy", { locale: ru })}`
                          : ""
                      }`
                    : `БВ — ${p.date ? format(new Date(p.date), "d MMM yyyy", { locale: ru }) : ""}`}
                </span>
                {p.note && <span className="text-gray-500">{p.note}</span>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => deleteMutation.mutate(p.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-membership-${p.id}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainerSubscriptionSubsection({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const [type, setType] = useState<TrainerPaymentType>("monthly");
  const [totalSessions, setTotalSessions] = useState<number>(8);
  const [startDate, setStartDate] = useState<string>(todayLocalStr());
  const [note, setNote] = useState<string>("");

  const { data: payments = [], isLoading } = useQuery<TrainerPaymentWithUsage[]>({
    queryKey: ["/api/trainer/students", studentId, "trainer-payments"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/trainer/students/${studentId}/trainer-payments`);
      return r.json();
    },
    enabled: !!studentId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/trainer/students/${studentId}/trainer-payments`, {
        type,
        totalSessions,
        startDate,
        note: note || null,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "trainer-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["payment-status"] });
      setNote("");
      toast({ title: "Абонемент добавлен" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/trainer/trainer-payments/${id}/cancel`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "trainer-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["payment-status"] });
      toast({ title: "Абонемент отменён" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/trainer/trainer-payments/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "trainer-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId, "payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["payment-status"] });
      toast({ title: "Абонемент удалён" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const handleTypeChange = (next: TrainerPaymentType) => {
    setType(next);
    setTotalSessions(TRAINER_TYPE_DEFAULT_SESSIONS[next]);
  };

  const active = payments.find((p) => p.status === "active");
  const remaining = active ? Math.max(0, active.totalSessions - active.usedSessions) : 0;

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Тренер — абонемент
        </p>
        {active ? (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
            data-testid="badge-trainer-active"
          >
            {TRAINER_TYPE_LABELS[active.type as TrainerPaymentType]}: {active.usedSessions}/{active.totalSessions}
            {remaining > 0 && ` (осталось ${remaining})`}
          </span>
        ) : (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
            data-testid="badge-trainer-none"
          >
            Нет активного абонемента
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 items-end">
        <div>
          <Label className="text-xs">Тип</Label>
          <select
            className="w-full text-sm border rounded px-2 py-1 bg-background"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as TrainerPaymentType)}
            data-testid="select-trainer-type"
          >
            <option value="single">Разовая</option>
            <option value="weekly">Неделя</option>
            <option value="monthly">Месяц</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Тренировок</Label>
          <Input
            type="number"
            min={1}
            max={type === "single" ? 1 : type === "weekly" ? 7 : 31}
            value={totalSessions}
            onChange={(e) => setTotalSessions(Number(e.target.value) || 1)}
            disabled={type === "single"}
            className="text-sm"
            data-testid="input-trainer-sessions"
          />
        </div>
        <div>
          <Label className="text-xs">Начало</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-sm"
            data-testid="input-trainer-start"
          />
        </div>
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Примечание (необязательно)"
        className="text-sm"
        data-testid="input-trainer-note"
      />
      <Button
        size="sm"
        className="w-full"
        onClick={() => addMutation.mutate()}
        disabled={addMutation.isPending || !startDate || totalSessions < 1}
        data-testid="button-add-trainer-payment"
      >
        {addMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
        Создать абонемент
      </Button>

      {isLoading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : payments.length === 0 ? (
        <p className="text-xs text-gray-500">Абонементов пока нет.</p>
      ) : (
        <div className="space-y-1">
          {payments.map((p) => {
            const left = Math.max(0, p.totalSessions - p.usedSessions);
            const statusLabel =
              p.status === "active"
                ? `${p.usedSessions}/${p.totalSessions} • осталось ${left}`
                : p.status === "completed"
                ? "израсходован"
                : "отменён";
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between text-xs border rounded px-2 py-1 ${
                  p.status === "active"
                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
                    : "bg-gray-50 dark:bg-gray-800"
                }`}
                data-testid={`row-trainer-payment-${p.id}`}
              >
                <div className="flex flex-col flex-1">
                  <span className="font-medium flex items-center gap-1">
                    <Dumbbell className="h-3 w-3" />
                    {TRAINER_TYPE_LABELS[p.type as TrainerPaymentType]} —{" "}
                    {format(new Date(p.startDate), "d MMM yyyy", { locale: ru })}
                  </span>
                  <span className="text-gray-500">{statusLabel}</span>
                  {p.note && <span className="text-gray-500">{p.note}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {p.status === "active" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => cancelMutation.mutate(p.id)}
                      disabled={cancelMutation.isPending}
                      title="Отменить (закрыть досрочно)"
                      data-testid={`button-cancel-trainer-payment-${p.id}`}
                    >
                      <X className="h-3.5 w-3.5 text-amber-600" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => deleteMutation.mutate(p.id)}
                    disabled={deleteMutation.isPending}
                    title="Удалить совсем"
                    data-testid={`button-delete-trainer-payment-${p.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-500">
        Тренировки списываются автоматически при отметке «Пришёл» или «Опоздал».
      </p>
    </div>
  );
}
