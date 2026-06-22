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
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import {
  type User,
  type Document,
  type StudentWithConsents,
  type MembershipPayment,
  type TrainerPaymentWithUsage,
  type TrainerPaymentType,
} from "@shared/schema";
import { BookStudentDialog } from "./book-student-dialog";
import { RecurringBookingsPanel } from "./recurring-bookings-panel";
import { DocumentViewDialog } from "./document-view-dialog";
import {
  TrainerStudentConsentsBlock,
  TrainerStudentConsentsManager,
} from "./trainer-student-consents-block";
import {
  TrainerNewStudentServiceFields,
  TrainerStudentServiceSection,
} from "./trainer-student-service-section";
import { computeSessionPrice } from "@shared/consents-pricing";
import type { TrainerService } from "@shared/schema";
import { Users, Search, Phone, UserCheck, Clock, Loader2, Calendar, UserPlus, Trash2, Eye, Edit, Activity, Heart, Wallet, Dumbbell, X, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  birthDateAgeSuffix,
  birthDateValidationError,
  calculateAge,
  legalRepresentativeSectionHint,
  studentIsUnder18,
  studentNeedsLegalRepresentative,
  todayLocalStr,
} from "@/lib/utils-gym";
import { legalRepresentativeFieldsError } from "@shared/legal-representative-fields";

type StudentWithConsentsExtended = StudentWithConsents & {
  exemptMembership?: boolean;
  exemptTrainerPayment?: boolean;
};

interface StudentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyNewStudent = {
  firstName: "",
  lastName: "",
  middleName: "",
  phone: "",
  password: "12345",
  birthDate: "",
  trainerNotes: "",
  motherFullName: "",
  motherPhone: "",
  fatherFullName: "",
  fatherPhone: "",
};

type RepresentativeFormValues = {
  motherFullName: string;
  motherPhone: string;
  fatherFullName: string;
  fatherPhone: string;
};

function LegalRepresentativesFields({
  values,
  onChange,
  age,
  disabled = false,
}: {
  values: RepresentativeFormValues;
  onChange: (patch: Partial<RepresentativeFormValues>) => void;
  age: number | null;
  disabled?: boolean;
}) {
  if (age === null || age >= 18) return null;

  const needsLegalRep = studentNeedsLegalRepresentative(age);
  const hint = legalRepresentativeSectionHint(age);

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-800 dark:bg-amber-950/20">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Законные представители
        </p>
        {hint && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{hint}</p>
        )}
        {needsLegalRep && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Укажите хотя бы одного родителя (ФИО и телефон). Подтверждение статуса представителя родители смогут дать при входе в приложение.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Мать</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">ФИО</Label>
            <Input
              value={values.motherFullName}
              onChange={(e) => onChange({ motherFullName: e.target.value })}
              placeholder="Иванова Мария Петровна"
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">Телефон</Label>
            <Input
              value={values.motherPhone}
              onChange={(e) => onChange({ motherPhone: e.target.value })}
              placeholder="79991234567"
              disabled={disabled}
            />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Отец</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">ФИО</Label>
            <Input
              value={values.fatherFullName}
              onChange={(e) => onChange({ fatherFullName: e.target.value })}
              placeholder="Иванов Иван Иванович"
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">Телефон</Label>
            <Input
              value={values.fatherPhone}
              onChange={(e) => onChange({ fatherPhone: e.target.value })}
              placeholder="79997654321"
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudentsPanel({ open, onOpenChange }: StudentsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [quickFilter, setQuickFilter] = useState<"all" | "debt" | "pending">("all");
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);
  const [studentToDeactivate, setStudentToDeactivate] = useState<User | null>(null);
  const [studentToReactivate, setStudentToReactivate] = useState<User | null>(null);
  const [reactivateResetCv, setReactivateResetCv] = useState(true);
  const [viewStudentId, setViewStudentId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [newStudent, setNewStudent] = useState(emptyNewStudent);
  const [addStudentAcceptedDocs, setAddStudentAcceptedDocs] = useState<Record<string, boolean>>({});
  const [addStudentServiceId, setAddStudentServiceId] = useState("");
  const [addExemptMembership, setAddExemptMembership] = useState(false);
  const [addExemptTrainerPayment, setAddExemptTrainerPayment] = useState(false);
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

  useEffect(() => {
    if (!addDialogOpen) {
      setAddStudentAcceptedDocs({});
      setAddStudentServiceId("");
      setAddExemptMembership(false);
      setAddExemptTrainerPayment(false);
    }
  }, [addDialogOpen]);

  const { data: trainerServices = [] } = useQuery<TrainerService[]>({
    queryKey: ["/api/trainer/services"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/trainer/services");
      return r.json();
    },
    enabled: addDialogOpen,
    staleTime: 0,
  });

  useEffect(() => {
    if (!addDialogOpen || addStudentServiceId) return;
    const active = trainerServices.filter((s) => s.isActive);
    const def = active.find((s) => s.isDefault) ?? active[0];
    if (def) setAddStudentServiceId(def.id);
  }, [addDialogOpen, trainerServices, addStudentServiceId]);

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
      setAddStudentAcceptedDocs({});
      setAddStudentServiceId("");
      setAddExemptMembership(false);
      setAddExemptTrainerPayment(false);
      setSearchQuery("");
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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({
        title: "Ученик удалён",
        description: data?.deletedParentCount > 0
          ? "Это был последний ребёнок — аккаунт родителя удалён автоматически."
          : undefined,
      });
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

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/trainer/students/${id}/approve`, {});
      return r.json();
    },
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      toast({ title: "Ученик одобрен", description: "Ученик получил уведомление и может записываться на тренировки" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const getStudentFlags = (student: User & { pendingDocumentCount?: number }) => {
    const isInactive = (student as any).isActive === false;
    const isPending = (student as any).isPendingApproval === true;
    const hasMembership = (student as any).hasMembership as boolean | undefined;
    const hasTrainerPayment = (student as any).hasTrainerPayment as boolean | undefined;
    const exemptMembership = (student as any).exemptMembership === true;
    const exemptTrainerPayment = (student as any).exemptTrainerPayment === true;
    const needsCv = !exemptMembership && hasMembership === false;
    const needsTrainer = !exemptTrainerPayment && hasTrainerPayment === false;
    const hasDebt =
      !isInactive &&
      !isPending &&
      hasMembership !== undefined &&
      (needsCv || needsTrainer);
    return { isInactive, isPending, hasDebt };
  };

  const filteredStudents = students.filter((student) => {
    const query = searchQuery.toLowerCase().trim();
    const flags = getStudentFlags(student);
    if (showInactive) {
      if (!flags.isInactive) return false;
    } else if (flags.isInactive) {
      return false;
    }
    if (quickFilter === "debt" && !flags.hasDebt) return false;
    if (quickFilter === "pending" && !flags.isPending) return false;
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
  const visibleStudents = filteredStudents;

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
    if (newStudent.birthDate) {
      const birthErr = birthDateValidationError(newStudent.birthDate, "optional");
      if (birthErr) {
        toast({ title: birthErr, variant: "destructive" });
        return;
      }
    }
    const repErr = legalRepresentativeFieldsError(newStudent.birthDate || null, {
      motherFullName: newStudent.motherFullName,
      motherPhone: newStudent.motherPhone,
      fatherFullName: newStudent.fatherFullName,
      fatherPhone: newStudent.fatherPhone,
    });
    if (repErr) {
      toast({ title: repErr, variant: "destructive" });
      return;
    }
    const consentDocumentIds = documents
      .filter((d) => addStudentAcceptedDocs[d.id])
      .map((d) => d.id);
    addMutation.mutate({
      ...newStudent,
      consentDocumentIds,
      selectedServiceId: addStudentServiceId || undefined,
      exemptMembership: addExemptMembership,
      exemptTrainerPayment: addExemptTrainerPayment,
    });
  };

  const addStudentPricePreview = useMemo(() => {
    const active = trainerServices.filter((s) => s.isActive);
    const svc = active.find((s) => s.id === addStudentServiceId) ?? active[0];
    if (!svc) return null;
    const signed = new Set(
      documents.filter((d) => addStudentAcceptedDocs[d.id]).map((d) => d.id),
    );
    return computeSessionPrice({
      service: { id: svc.id, name: svc.name, priceRub: svc.priceRub },
      documents,
      signedDocumentIds: signed,
    });
  }, [trainerServices, addStudentServiceId, documents, addStudentAcceptedDocs]);

  const newStudentAge = useMemo(
    () => calculateAge(newStudent.birthDate || null),
    [newStudent.birthDate],
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:w-[440px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Ученики
            </SheetTitle>
          </SheetHeader>

          <div className="sticky top-0 z-10 bg-background pb-2">
            <Button
              className="w-full mb-3"
              onClick={() => setAddDialogOpen(true)}
              data-testid="button-add-student"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Добавить ученика
            </Button>

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Поиск по имени или телефону..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Button
                size="sm"
                variant={quickFilter === "all" ? "default" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => setQuickFilter("all")}
              >
                Все
              </Button>
              <Button
                size="sm"
                variant={quickFilter === "debt" ? "default" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => setQuickFilter("debt")}
              >
                Долг
              </Button>
              <Button
                size="sm"
                variant={quickFilter === "pending" ? "default" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => setQuickFilter("pending")}
              >
                Ожидают
              </Button>
            </div>

            <div className="flex items-center justify-between mb-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                <span>
                  Учеников: <strong>{visibleStudents.length}</strong>
                  {showInactive ? " в архиве" : ""}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant={showInactive ? "secondary" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setShowInactive((v) => {
                    const next = !v;
                    if (next) setQuickFilter("all");
                    return next;
                  });
                }}
              >
                {showInactive ? "Скрыть архив" : "Показать архив"}
              </Button>
            </div>

          </div>

          {/* Students list */}
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : visibleStudents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {searchQuery
                ? "Ученики не найдены"
                : showInactive
                  ? "В архиве пока нет учеников"
                  : "Пока нет зарегистрированных учеников"}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleStudents.map((student) => {
                const age = calculateAge((student as any).birthDate);
                const { isInactive, isPending, hasDebt } = getStudentFlags(student);
                const hasPendingDocs = (student.pendingDocumentCount ?? 0) > 0;
                const isParentAccount = student.role === "parent";
                const isParentMode = !!(student as any).isParent;
                const hasLinkedChildren = !!(student as any).hasLinkedChildren;
                const hasMembership = (student as any).hasMembership as boolean | undefined;
                const hasTrainerPayment = (student as any).hasTrainerPayment as boolean | undefined;
                const exemptMembership = (student as any).exemptMembership === true;
                const exemptTrainerPayment = (student as any).exemptTrainerPayment === true;
                return (
                  <div key={student.id} className={`border rounded-lg transition-shadow p-2.5 ${
                      isInactive
                        ? "bg-gray-50 dark:bg-gray-900 opacity-70 border-dashed"
                        : isPending
                          ? "bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700 hover:shadow-sm"
                          : hasDebt
                            ? "bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-700 hover:shadow-sm"
                            : hasPendingDocs
                              ? "bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-700 hover:shadow-sm"
                              : "bg-white dark:bg-gray-800 hover:shadow-sm"
                    }`}>
                      {isPending && !isInactive && (
                        <div className="flex items-center justify-between gap-2 rounded-md bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 mb-2 p-1.5">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                            <Clock className="h-3.5 w-3.5" />
                            Ожидает вашего одобрения
                          </span>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => approveMutation.mutate(student.id)}
                            disabled={approveMutation.isPending}
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Одобрить
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      <div className="flex justify-between gap-2 items-center">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <button
                              type="button"
                              className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 hover:underline text-left text-sm leading-tight"
                              onClick={() => setViewStudentId(student.id)}
                              data-testid={`button-view-student-${student.id}`}
                            >
                              {student.lastName} {student.firstName} {(student as any).middleName || ""}
                            </button>
                          {age !== null && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {age} {age === 1 ? "год" : age >= 2 && age <= 4 ? "года" : "лет"}
                            </Badge>
                          )}
                            {(isParentAccount || isParentMode) && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700">
                                родитель
                              </span>
                            )}
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
                            {hasDebt && (
                              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700">
                              <span className="text-[10px] font-semibold leading-none">₽</span>
                                {!hasMembership && !hasTrainerPayment
                                ? "Взнос и Тренеру"
                                  : !hasMembership
                                  ? "Взнос"
                                  : "Тренеру"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 text-xs">
                            <Phone className="h-2.5 w-2.5" />
                            <span>{student.phone}</span>
                          </div>
                        </div>
                        <div className="shrink-0 grid grid-cols-2 gap-1.5 min-w-[170px]">
                          {!isInactive && !isPending && (
                            <Button
                              size="sm"
                              onClick={() => handleBookStudent(student)}
                              data-testid={`button-book-student-${student.id}`}
                              className="h-8 px-2 text-xs"
                            >
                              <Calendar className="h-3.5 w-3.5 mr-1" />
                              Запись
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewStudentId(student.id)}
                            className="h-8 px-2 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Карточка
                          </Button>
                          {isInactive ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 h-8 px-2 text-xs"
                              onClick={() => { setStudentToReactivate(student); setReactivateResetCv(true); }}
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1" />
                              Вернуть
                            </Button>
                          ) : (
                            !isPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-8 px-2 text-xs"
                                onClick={() => setStudentToDeactivate(student)}
                                data-testid={`button-deactivate-student-${student.id}`}
                              >
                                <X className="h-3.5 w-3.5 mr-1" />
                                Пауза
                              </Button>
                            )
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 text-xs col-span-2 h-7"
                            onClick={() => setStudentToDelete(student)}
                            disabled={isParentAccount && hasLinkedChildren}
                            title={isParentAccount && hasLinkedChildren ? "Сначала удалите или отвяжите детей" : undefined}
                            data-testid={`button-delete-student-${student.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
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
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-md sm:w-full max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
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
                max={todayLocalStr()}
                value={newStudent.birthDate}
                onChange={(e) => setNewStudent({ ...newStudent, birthDate: e.target.value })}
              />
            </div>
            <LegalRepresentativesFields
              age={newStudentAge}
              values={{
                motherFullName: newStudent.motherFullName,
                motherPhone: newStudent.motherPhone,
                fatherFullName: newStudent.fatherFullName,
                fatherPhone: newStudent.fatherPhone,
              }}
              onChange={(patch) => setNewStudent({ ...newStudent, ...patch })}
              disabled={addMutation.isPending}
            />
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

            <PaymentExemptFields
              exemptMembership={addExemptMembership}
              exemptTrainerPayment={addExemptTrainerPayment}
              onExemptMembershipChange={setAddExemptMembership}
              onExemptTrainerPaymentChange={setAddExemptTrainerPayment}
              disabled={addMutation.isPending}
            />

            <TrainerNewStudentServiceFields
              services={trainerServices}
              selectedServiceId={addStudentServiceId}
              onServiceChange={setAddStudentServiceId}
              previewTotalRub={addStudentPricePreview?.totalPriceRub ?? null}
              serviceName={addStudentPricePreview?.serviceName ?? "Тренировка"}
            />

            <TrainerStudentConsentsBlock
              documents={documents}
              acceptedByDocId={addStudentAcceptedDocs}
              onToggle={(documentId, accepted) =>
                setAddStudentAcceptedDocs((prev) => ({ ...prev, [documentId]: accepted }))
              }
              onViewDocument={setViewingDoc}
              disabled={addMutation.isPending}
            />
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

  const { data: student, isLoading } = useQuery<StudentWithConsentsExtended>({
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
      const s = student as any;
      setForm({
        firstName: student.firstName || "",
        lastName: student.lastName || "",
        middleName: student.middleName || "",
        phone: student.phone || "",
        birthDate: student.birthDate || "",
        trainerNotes: student.trainerNotes || "",
        exemptMembership: student.exemptMembership === true,
        exemptTrainerPayment: student.exemptTrainerPayment === true,
        motherFullName: s.motherFullName || "",
        motherPhone: s.motherPhone || "",
        fatherFullName: s.fatherFullName || "",
        fatherPhone: s.fatherPhone || "",
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
      queryClient.invalidateQueries({ queryKey: ["payment-status"] });
      toast({ title: "Сохранено" });
      setEditing(false);
    },
    onError: (e: any) => {
      toast({ title: "Не удалось сохранить", description: e?.message, variant: "destructive" });
    },
  });

  const age = calculateAge(editing ? (form.birthDate || null) : (student?.birthDate ?? null));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-lg sm:w-full max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-base sm:text-lg leading-snug">Карточка ученика</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">Просмотр и редактирование данных ученика.</DialogDescription>
        </DialogHeader>
        {isLoading || !student ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : !editing ? (
          <div className="space-y-3 text-sm min-w-0">
            <Field label="ФИО" value={`${student.lastName || ""} ${student.firstName} ${student.middleName || ""}`.trim()} />
            <Field label="Телефон" value={student.phone} />
            <Field
              label="Дата рождения"
              value={
                student.birthDate
                  ? `${format(new Date(student.birthDate), "d MMMM yyyy", { locale: ru })}${birthDateAgeSuffix(student.birthDate)}`
                  : "—"
              }
            />
            <Field label="Заметки тренера" value={student.trainerNotes || "—"} multiline />
            <PaymentExemptSection studentId={student.id} student={student} />
            {(() => {
              const s = student as any;
              const hasMother = s.motherFullName || s.motherPhone;
              const hasFather = s.fatherFullName || s.fatherPhone;
              const hasLegacyParent = student.parentFullName || student.parentPhone;
              const hasAny = hasMother || hasFather || hasLegacyParent;
              const under18 = studentIsUnder18(age);
              const needsLegalRep = studentNeedsLegalRepresentative(age);
              const ageHint = legalRepresentativeSectionHint(age);
              if (!hasAny && !under18) return null;
              return (
                <div className="border rounded p-3 bg-amber-50 dark:bg-amber-950/20 space-y-3">
                  <p className="font-medium text-sm flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    Законные представители
                    {ageHint && (
                      <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
                        ({ageHint})
                      </span>
                    )}
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
                  {(hasMother || hasFather) && (
                    <Field
                      label="Подтверждение представителя"
                      value={
                        student.legalRepresentativeConfirmed
                          ? "Подтверждено родителем в приложении"
                          : "Ожидает подтверждения родителем"
                      }
                    />
                  )}
                  {hasLegacyParent && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                        Законный представитель (при регистрации)
                      </p>
                      <Field
                        label="Подтверждение"
                        value={student.legalRepresentativeConfirmed ? "Является законным представителем" : "Не подтверждено"}
                      />
                      <Field label="ФИО" value={student.parentFullName || "—"} />
                      <Field label="Телефон" value={student.parentPhone || "—"} />
                      <Field
                        label="Статус родителя"
                        value={`Родитель${
                          s.parentAlsoTrainsName
                            ? ` (${s.parentAlsoTrainsName})`
                            : student.parentFullName
                              ? ` (${student.parentFullName})`
                              : ""
                        }`}
                      />
                    </div>
                  )}
                  {!hasAny && under18 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {needsLegalRep
                        ? "Данные не заполнены. Родитель может добавить их в разделе «Мой профиль» в приложении."
                        : "Контакт родителей не указан. Можно уточнить у ученика или попросить заполнить профиль."}
                    </p>
                  )}
                </div>
              );
            })()}
            <TrainerStudentServiceSection studentId={student.id} />
            <TrainerStudentConsentsManager
              studentId={student.id}
              consents={student.consents}
            />
            <AttendanceSection studentId={student.id} />
            <PaymentsSection studentId={student.id} />
            <SickLeaveSection student={student} />
            <RecurringBookingsPanel studentId={student.id} />
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Закрыть</Button>
              <Button className="w-full sm:w-auto" onClick={() => setEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Редактировать
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="min-w-0">
                <Label>Фамилия</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="min-w-0">
                <Label>Имя</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
            </div>
            <div className="min-w-0">
              <Label>Отчество</Label>
              <Input value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
            </div>
            <div className="min-w-0">
              <Label htmlFor="student-card-phone">Телефон</Label>
              <Input
                id="student-card-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7 (999) 123-45-67"
                data-testid="input-student-card-phone"
              />
            </div>
            <div>
              <Label>Дата рождения</Label>
              <Input
                type="date"
                max={todayLocalStr()}
                value={form.birthDate}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Заметки тренера</Label>
              <Textarea
                rows={4}
                value={form.trainerNotes}
                onChange={(e) => setForm({ ...form, trainerNotes: e.target.value })}
              />
            </div>
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Освобождение от оплаты</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={!!form.exemptMembership}
                  onCheckedChange={(v) => setForm({ ...form, exemptMembership: !!v })}
                />
                <span className="text-sm leading-tight">Не требовать членский взнос (ЧВ/БВ)</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={!!form.exemptTrainerPayment}
                  onCheckedChange={(v) => setForm({ ...form, exemptTrainerPayment: !!v })}
                />
                <span className="text-sm leading-tight">Не требовать оплату тренеру</span>
              </label>
            </div>
            {age !== null && age < 18 && (
              <LegalRepresentativesFields
                age={age}
                values={{
                  motherFullName: form.motherFullName || "",
                  motherPhone: form.motherPhone || "",
                  fatherFullName: form.fatherFullName || "",
                  fatherPhone: form.fatherPhone || "",
                }}
                onChange={(patch) => setForm({ ...form, ...patch })}
                disabled={updateMutation.isPending}
              />
            )}
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditing(false)}>Отмена</Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  if (form.phone.replace(/\D/g, "").length < 10) {
                    toast({ title: "Укажите корректный телефон", variant: "destructive" });
                    return;
                  }
                  if (form.birthDate) {
                    const birthErr = birthDateValidationError(form.birthDate, "optional");
                    if (birthErr) {
                      toast({ title: birthErr, variant: "destructive" });
                      return;
                    }
                  }
                  const repErr = legalRepresentativeFieldsError(form.birthDate || null, {
                    motherFullName: form.motherFullName,
                    motherPhone: form.motherPhone,
                    fatherFullName: form.fatherFullName,
                    fatherPhone: form.fatherPhone,
                  });
                  if (repErr) {
                    toast({ title: repErr, variant: "destructive" });
                    return;
                  }
                  updateMutation.mutate(form);
                }}
                disabled={updateMutation.isPending}
              >
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

function PaymentExemptFields({
  exemptMembership,
  exemptTrainerPayment,
  onExemptMembershipChange,
  onExemptTrainerPaymentChange,
  disabled = false,
}: {
  exemptMembership: boolean;
  exemptTrainerPayment: boolean;
  onExemptMembershipChange: (value: boolean) => void;
  onExemptTrainerPaymentChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Освобождение от оплаты
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Для бесплатных занятий или учеников без абонемента — красные отметки в расписании не показываются.
      </p>
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={exemptMembership}
          disabled={disabled}
          onCheckedChange={(v) => onExemptMembershipChange(!!v)}
        />
        <span className="text-sm leading-tight">Не требовать членский взнос (ЧВ/БВ)</span>
      </label>
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={exemptTrainerPayment}
          disabled={disabled}
          onCheckedChange={(v) => onExemptTrainerPaymentChange(!!v)}
        />
        <span className="text-sm leading-tight">Не требовать оплату тренеру</span>
      </label>
    </div>
  );
}

function PaymentExemptSection({
  studentId,
  student,
}: {
  studentId: string;
  student: { exemptMembership?: boolean; exemptTrainerPayment?: boolean };
}) {
  const { toast } = useToast();
  const [exemptMembership, setExemptMembership] = useState(student.exemptMembership === true);
  const [exemptTrainerPayment, setExemptTrainerPayment] = useState(student.exemptTrainerPayment === true);

  useEffect(() => {
    setExemptMembership(student.exemptMembership === true);
    setExemptTrainerPayment(student.exemptTrainerPayment === true);
  }, [student.exemptMembership, student.exemptTrainerPayment]);

  const patchMutation = useMutation({
    mutationFn: async (payload: { exemptMembership?: boolean; exemptTrainerPayment?: boolean }) => {
      const r = await apiRequest("PATCH", `/api/trainer/students/${studentId}`, payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId] });
      queryClient.invalidateQueries({ queryKey: ["payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", studentId] });
      toast({ title: "Сохранено" });
    },
    onError: (e: any) => {
      setExemptMembership(student.exemptMembership === true);
      setExemptTrainerPayment(student.exemptTrainerPayment === true);
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" });
    },
  });

  const handleToggle = (field: "exemptMembership" | "exemptTrainerPayment", next: boolean) => {
    if (field === "exemptMembership") setExemptMembership(next);
    else setExemptTrainerPayment(next);
    patchMutation.mutate({ [field]: next });
  };

  return (
    <PaymentExemptFields
      exemptMembership={exemptMembership}
      exemptTrainerPayment={exemptTrainerPayment}
      onExemptMembershipChange={(v) => handleToggle("exemptMembership", v)}
      onExemptTrainerPaymentChange={(v) => handleToggle("exemptTrainerPayment", v)}
      disabled={patchMutation.isPending}
    />
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="text-xs">Болеет до</Label>
          <Input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="text-sm w-full min-w-0"
            data-testid="input-sick-until"
          />
        </div>
        <div className="min-w-0">
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="sm"
          className="w-full sm:flex-1"
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
            className="w-full sm:w-auto"
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
    <div className="border rounded p-3 space-y-3 min-w-0 overflow-hidden">
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
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      toast({ title: "Оплата удалена" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const hasCvCurrentMonth = payments.some(p => p.type === "monthly_cv" && p.month === currentMonthStr());

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 shrink-0">
          Зал — членский взнос
        </p>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border w-fit max-w-full ${
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-end">
        <div className="min-w-0">
          <Label className="text-xs">Тип</Label>
          <select
            className="w-full min-w-0 text-sm border rounded px-2 py-1 bg-background"
            value={type}
            onChange={(e) => setType(e.target.value as "monthly_cv" | "one_time_bv")}
            data-testid="select-membership-type"
          >
            <option value="monthly_cv">ЧВ (месяц)</option>
            <option value="one_time_bv">БВ (разово)</option>
          </select>
        </div>
        {type === "monthly_cv" ? (
          <div className="min-w-0">
            <Label className="text-xs">Дата оплаты учеником</Label>
            <Input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="text-sm w-full min-w-0"
              data-testid="input-cv-paid-date"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">
              Засчитается за {paidDate ? monthLabel(paidDate.slice(0, 7)) : "—"}
            </p>
          </div>
        ) : (
          <div className="min-w-0">
            <Label className="text-xs">Дата</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm w-full min-w-0"
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
              className="flex items-start justify-between gap-2 text-xs border rounded px-2 py-1 bg-gray-50 dark:bg-gray-800 min-w-0"
              data-testid={`row-membership-${p.id}`}
            >
              <div className="flex flex-col min-w-0 flex-1 break-words">
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
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
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
    <div className="space-y-2 pt-2 border-t min-w-0">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 shrink-0">
          Тренер — абонемент
        </p>
        {active ? (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border w-fit max-w-full bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
            data-testid="badge-trainer-active"
          >
            {TRAINER_TYPE_LABELS[active.type as TrainerPaymentType]}: {active.usedSessions}/{active.totalSessions}
            {remaining > 0 && ` (осталось ${remaining})`}
          </span>
        ) : (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border w-fit max-w-full bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
            data-testid="badge-trainer-none"
          >
            Нет активного абонемента
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
        <div className="min-w-0">
          <Label className="text-xs">Тип</Label>
          <select
            className="w-full min-w-0 text-sm border rounded px-2 py-1 bg-background"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as TrainerPaymentType)}
            data-testid="select-trainer-type"
          >
            <option value="single">Разовая</option>
            <option value="weekly">Неделя</option>
            <option value="monthly">Месяц</option>
          </select>
        </div>
        <div className="min-w-0">
          <Label className="text-xs">Тренировок</Label>
          <Input
            type="number"
            min={1}
            max={type === "single" ? 1 : type === "weekly" ? 7 : 31}
            value={totalSessions}
            onChange={(e) => setTotalSessions(Number(e.target.value) || 1)}
            disabled={type === "single"}
            className="text-sm w-full min-w-0"
            data-testid="input-trainer-sessions"
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs">Начало</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-sm w-full min-w-0"
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
                className={`flex items-start justify-between gap-2 text-xs border rounded px-2 py-1 min-w-0 ${
                  p.status === "active"
                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
                    : "bg-gray-50 dark:bg-gray-800"
                }`}
                data-testid={`row-trainer-payment-${p.id}`}
              >
                <div className="flex flex-col flex-1 min-w-0 break-words">
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
