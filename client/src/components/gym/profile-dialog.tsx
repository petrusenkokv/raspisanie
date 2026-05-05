import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { User, Pencil, Save, X, Phone, CalendarDays, Users, UserCircle2, Loader2, Baby, Wallet, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import { updateStudentProfileSchema, type User as UserType, type PaymentRequest } from "@shared/schema";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

type FormValues = typeof updateStudentProfileSchema._type;

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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-muted-foreground flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium break-words">{value || "—"}</div>
      </div>
    </div>
  );
}

function RepresentativeEditBlock({
  title,
  nameField,
  phoneField,
  form,
}: {
  title: string;
  nameField: keyof FormValues;
  phoneField: keyof FormValues;
  form: any;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <FormField control={form.control} name={nameField as string} render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">ФИО</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ""} placeholder="Иванова Мария Петровна" className="text-sm" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name={phoneField as string} render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Телефон</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ""} placeholder="79991234567" className="text-sm" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
    </div>
  );
}

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentUser, setUser } = useGymStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  const { data: freshData, isLoading: isFetching } = useQuery({
    queryKey: ["/api/users", currentUser?.id],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/users/${currentUser!.id}`);
      return r.json() as Promise<{ user: UserType }>;
    },
    enabled: open && !!currentUser?.id && currentUser.role !== "trainer",
    staleTime: 0,
  });

  useEffect(() => {
    if (freshData?.user) {
      setUser(freshData.user);
    }
  }, [freshData, setUser]);

  const user = freshData?.user ?? currentUser;

  const form = useForm<FormValues>({
    resolver: zodResolver(updateStudentProfileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      middleName: "",
      birthDate: "",
      phone: "",
      parentFullName: "",
      parentPhone: "",
      motherFullName: "",
      motherPhone: "",
      fatherFullName: "",
      fatherPhone: "",
      guardianFullName: "",
      guardianPhone: "",
    },
  });

  useEffect(() => {
    if (user && open) {
      form.reset({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        middleName: user.middleName ?? "",
        birthDate: user.birthDate ?? "",
        phone: user.phone ?? "",
        parentFullName: user.parentFullName ?? "",
        parentPhone: user.parentPhone ?? "",
        motherFullName: (user as any).motherFullName ?? "",
        motherPhone: (user as any).motherPhone ?? "",
        fatherFullName: (user as any).fatherFullName ?? "",
        fatherPhone: (user as any).fatherPhone ?? "",
        guardianFullName: (user as any).guardianFullName ?? "",
        guardianPhone: (user as any).guardianPhone ?? "",
      });
    }
    if (!open) setEditing(false);
  }, [user, open, form]);

  const watchedBirthDate = useWatch({ control: form.control, name: "birthDate" });
  const editAge = useMemo(() => calculateAge(watchedBirthDate), [watchedBirthDate]);
  const editRequiresParent = editAge !== null && editAge < 14;
  const editShowRepresentative = editAge === null || editAge < 18;

  const viewAge = useMemo(() => calculateAge(user?.birthDate), [user?.birthDate]);
  const viewRequiresParent = viewAge !== null && viewAge < 14;
  const viewShowRepresentative = viewAge === null || viewAge < 18;

  const hasAnyRepresentative = !!(
    user?.parentFullName || user?.parentPhone ||
    (user as any)?.motherFullName || (user as any)?.motherPhone ||
    (user as any)?.fatherFullName || (user as any)?.fatherPhone
  );

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const response = await apiRequest("PATCH", "/api/users/me", { userId: currentUser?.id, ...values });
      return response.json();
    },
    onSuccess: (data) => {
      setUser(data.user as UserType);
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      toast({ title: "Профиль сохранён" });
      setEditing(false);
    },
    onError: (error: any) => {
      toast({ title: "Не удалось сохранить", description: error?.message || "Попробуйте ещё раз", variant: "destructive" });
    },
  });

  const handleSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  if (!currentUser || currentUser.role === "trainer") return null;

  // ── Payment request section ──

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.trim() || "У";
  const fullName = [user?.lastName, user?.firstName, user?.middleName].filter(Boolean).join(" ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-blue-600" />
            Мой профиль
          </DialogTitle>
        </DialogHeader>

        {isFetching ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
            <span className="text-sm text-muted-foreground">Загрузка данных...</span>
          </div>
        ) : (
          <>
            {/* Avatar + name */}
            <div className="flex items-center gap-4 rounded-xl border bg-muted/40 p-4">
              <Avatar className="h-14 w-14 text-lg">
                <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold text-base leading-tight">{fullName || user?.firstName}</div>
                <div className="text-sm text-muted-foreground">{user?.phone}</div>
                {viewAge !== null && (
                  <div className="text-xs text-muted-foreground mt-0.5">{viewAge} лет</div>
                )}
              </div>
            </div>

            {/* ── VIEW MODE ── */}
            {!editing && (
              <div className="space-y-1">
                <InfoRow icon={<User className="h-4 w-4" />} label="Имя" value={user?.firstName} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Фамилия" value={user?.lastName} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Отчество" value={user?.middleName} />
                <Separator />
                <InfoRow
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="Дата рождения"
                  value={user?.birthDate
                    ? `${formatDate(user.birthDate)}${viewAge !== null ? ` (${viewAge} лет)` : ""}`
                    : undefined}
                />
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Телефон" value={user?.phone} />

                {viewShowRepresentative && (
                  <>
                    <Separator />
                    <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                        <Baby className="h-3.5 w-3.5" />
                        Законные представители
                        {viewRequiresParent && <span className="font-normal">(возраст менее 14 лет)</span>}
                      </p>
                      {((user as any)?.motherFullName || (user as any)?.motherPhone) && (
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Мать</p>
                          <InfoRow icon={<Users className="h-4 w-4" />} label="ФИО" value={(user as any)?.motherFullName} />
                          <InfoRow icon={<Phone className="h-4 w-4" />} label="Телефон" value={(user as any)?.motherPhone} />
                        </div>
                      )}
                      {((user as any)?.fatherFullName || (user as any)?.fatherPhone) && (
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Отец</p>
                          <InfoRow icon={<Users className="h-4 w-4" />} label="ФИО" value={(user as any)?.fatherFullName} />
                          <InfoRow icon={<Phone className="h-4 w-4" />} label="Телефон" value={(user as any)?.fatherPhone} />
                        </div>
                      )}
                      {!hasAnyRepresentative && viewRequiresParent && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">Данные не заполнены. Нажмите «Редактировать», чтобы добавить.</p>
                      )}
                    </div>
                  </>
                )}

                <Separator />
                <PaymentRequestSection studentId={currentUser.id} />

                <div className="flex justify-end pt-2">
                  <Button onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4 mr-2" />Редактировать
                  </Button>
                </div>
              </div>
            )}

            {/* ── EDIT MODE ── */}
            {editing && (
              <Form {...form}>
                <form className="grid gap-3" onSubmit={form.handleSubmit(handleSubmit)}>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem><FormLabel>Имя *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem><FormLabel>Фамилия *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="middleName" render={({ field }) => (
                    <FormItem><FormLabel>Отчество</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="birthDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Дата рождения *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ""} className="block" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>Телефон *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  {/* Representatives section — visible only under 18 */}
                  {editShowRepresentative && <div className={editRequiresParent
                    ? "rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 space-y-4"
                    : "border rounded-lg p-3 space-y-4"}>
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <Baby className="h-4 w-4 text-amber-600" />
                      Законные представители
                      <span className="font-normal text-xs text-muted-foreground">
                        {editRequiresParent ? "(возраст менее 14 лет)" : "(необязательно)"}
                      </span>
                    </p>

                    <RepresentativeEditBlock
                      title="Мать"
                      nameField="motherFullName"
                      phoneField="motherPhone"
                      form={form}
                    />
                    <RepresentativeEditBlock
                      title="Отец"
                      nameField="fatherFullName"
                      phoneField="fatherPhone"
                      form={form}
                    />
                  </div>}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" onClick={() => { setEditing(false); form.reset(); }} disabled={mutation.isPending}>
                      <X className="h-4 w-4 mr-2" />Отмена
                    </Button>
                    <Button type="submit" disabled={mutation.isPending}>
                      <Save className="h-4 w-4 mr-2" />
                      {mutation.isPending ? "Сохраняем..." : "Сохранить"}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Student payment request section ──
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function PaymentRequestSection({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const [type, setType] = useState<"monthly_cv" | "one_time_bv">("monthly_cv");
  const [paidDate, setPaidDate] = useState(todayStr());
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: requests = [], isLoading } = useQuery<PaymentRequest[]>({
    queryKey: ["/api/student/payment-requests", studentId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/student/payment-requests/${studentId}`);
      return r.json();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { studentId, type, note };
      if (type === "monthly_cv") body.paidDate = paidDate;
      else body.date = date;
      const r = await apiRequest("POST", "/api/student/payment-requests", body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/payment-requests", studentId] });
      toast({ title: "Заявка отправлена тренеру" });
      setShowForm(false);
      setNote("");
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950/20"><Clock className="h-3 w-3 mr-1" />Ожидает</Badge>;
    if (status === "confirmed") return <Badge variant="outline" className="text-green-600 border-green-400 bg-green-50 dark:bg-green-950/20"><CheckCircle className="h-3 w-3 mr-1" />Подтверждено</Badge>;
    return <Badge variant="outline" className="text-red-600 border-red-400 bg-red-50 dark:bg-red-950/20"><AlertCircle className="h-3 w-3 mr-1" />Отклонено</Badge>;
  };

  const hasPending = requests.some(r => r.status === "pending");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Wallet className="h-4 w-4 text-blue-600" />
          Уведомить об оплате
        </p>
        {!showForm && !hasPending && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowForm(true)}>
            + Подать заявку
          </Button>
        )}
      </div>

      {hasPending && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          У вас есть заявка на рассмотрении. Новую можно подать после её обработки тренером.
        </p>
      )}

      {showForm && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={type === "monthly_cv" ? "default" : "outline"}
              className="h-7 text-xs flex-1"
              onClick={() => setType("monthly_cv")}
            >ЧВ (месячный)</Button>
            <Button
              size="sm"
              variant={type === "one_time_bv" ? "default" : "outline"}
              className="h-7 text-xs flex-1"
              onClick={() => setType("one_time_bv")}
            >БВ (разовый)</Button>
          </div>

          {type === "monthly_cv" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Дата оплаты</label>
              <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className="h-8 text-sm" />
            </div>
          )}
          {type === "one_time_bv" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Дата занятия</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-sm" />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Комментарий (необязательно)</label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Напр.: перевод на карту, оплата наличными..."
              className="text-sm resize-none h-16"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowForm(false)}>
              Отмена
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Отправить"}
            </Button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Загрузка...</p>}

      {requests.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">История заявок:</p>
          {requests.slice(0, 5).map(req => {
            const typeLabel = req.type === "monthly_cv" ? "ЧВ" : "БВ";
            const dateStr = req.type === "monthly_cv" && req.paidDate
              ? format(new Date(req.paidDate), "d MMM yyyy", { locale: ru })
              : req.date ? format(new Date(req.date), "d MMM yyyy", { locale: ru }) : "";
            return (
              <div key={req.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5 bg-background">
                <span className="font-medium text-gray-700 dark:text-gray-300">{typeLabel}{dateStr && <span className="font-normal text-gray-500 ml-1">— {dateStr}</span>}</span>
                {statusBadge(req.status)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
