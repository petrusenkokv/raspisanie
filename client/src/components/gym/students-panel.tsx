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
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type User, type Document, type StudentWithConsents } from "@shared/schema";
import { BookStudentDialog } from "./book-student-dialog";
import { DocumentViewDialog } from "./document-view-dialog";
import { DocumentsManagerDialog } from "./documents-manager-dialog";
import { Users, Search, Phone, UserCheck, Clock, Loader2, Calendar, UserPlus, Trash2, FileText, Eye, Edit } from "lucide-react";
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
  parentFullName: "",
  parentPhone: "",
};

export function StudentsPanel({ open, onOpenChange }: StudentsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);
  const [viewStudentId, setViewStudentId] = useState<string | null>(null);
  const [docsManagerOpen, setDocsManagerOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [newStudent, setNewStudent] = useState(emptyNewStudent);
  const [newStudentConsents, setNewStudentConsents] = useState<Record<string, boolean>>({});
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

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/documents");
      return r.json();
    },
    enabled: open,
  });

  const newStudentAge = useMemo(() => calculateAge(newStudent.birthDate), [newStudent.birthDate]);
  const newStudentRequiresParent = newStudentAge !== null && newStudentAge < 14;

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
      setNewStudentConsents({});
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
      ((student as any).middleName || "").toLowerCase().includes(query) ||
      (digitsQuery.length > 0 && phoneDigits.includes(digitsQuery))
    );
  });

  const handleBookStudent = (student: User) => {
    setSelectedStudent(student);
    setBookingDialogOpen(true);
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
    if (newStudentRequiresParent) {
      if (!newStudent.parentFullName.trim() || !newStudent.parentPhone.trim()) {
        toast({ title: "Заполните данные законного представителя", variant: "destructive" });
        return;
      }
    }
    const missingDocs = documents.filter(d => !newStudentConsents[d.id]);
    if (missingDocs.length > 0) {
      toast({
        title: "Примите все документы",
        description: missingDocs.map(d => d.title).join(", "),
        variant: "destructive",
      });
      return;
    }
    addMutation.mutate({
      ...newStudent,
      consentDocumentIds: Object.keys(newStudentConsents).filter(id => newStudentConsents[id]),
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
              {filteredStudents.map((student) => {
                const age = calculateAge((student as any).birthDate);
                return (
                  <div key={student.id} className="border rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-sm transition-shadow">
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
                          onClick={() => setViewStudentId(student.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Карточка
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

            {newStudentRequiresParent && (
              <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 space-y-3">
                <p className="text-sm font-medium">
                  Ученику меньше 14 лет — заполните данные законного представителя
                </p>
                <div>
                  <Label>ФИО законного представителя</Label>
                  <Input
                    value={newStudent.parentFullName}
                    onChange={(e) => setNewStudent({ ...newStudent, parentFullName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Телефон законного представителя</Label>
                  <Input
                    value={newStudent.parentPhone}
                    onChange={(e) => setNewStudent({ ...newStudent, parentPhone: e.target.value })}
                    placeholder="79991234567"
                  />
                </div>
              </div>
            )}

            {documents.length > 0 && (
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Согласия с документами</p>
                {documents.map(doc => (
                  <label key={doc.id} className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={!!newStudentConsents[doc.id]}
                      onCheckedChange={(v) => setNewStudentConsents(prev => ({ ...prev, [doc.id]: !!v }))}
                    />
                    <span className="flex-1">
                      Согласен(на) с{" "}
                      <button
                        type="button"
                        className="text-blue-600 underline"
                        onClick={() => setViewingDoc(doc)}
                      >
                        «{doc.title}»
                      </button>
                    </span>
                  </label>
                ))}
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
        parentFullName: student.parentFullName || "",
        parentPhone: student.parentPhone || "",
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
  const requiresParent = age !== null && age < 14;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Карточка ученика</DialogTitle>
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
            {(student.parentFullName || student.parentPhone) && (
              <div className="border rounded p-3 bg-amber-50 dark:bg-amber-950/20 space-y-2">
                <p className="font-medium">Законный представитель</p>
                <Field label="ФИО" value={student.parentFullName || "—"} />
                <Field label="Телефон" value={student.parentPhone || "—"} />
              </div>
            )}
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
            <div className={requiresParent ? "border rounded p-3 bg-amber-50 dark:bg-amber-950/20 space-y-2" : "space-y-2"}>
              <p className="font-medium text-sm">Законный представитель {requiresParent ? "(обязательно для младше 14 лет)" : "(необязательно)"}</p>
              <div>
                <Label>ФИО</Label>
                <Input value={form.parentFullName} onChange={(e) => setForm({ ...form, parentFullName: e.target.value })} />
              </div>
              <div>
                <Label>Телефон</Label>
                <Input value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} />
              </div>
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
