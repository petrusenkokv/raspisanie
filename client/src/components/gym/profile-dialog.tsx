import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { User, Pencil, Save, X, Phone, CalendarDays, Users, UserCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import { updateStudentProfileSchema, type User as UserType } from "@shared/schema";

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

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentUser, setUser } = useGymStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  // Fetch fresh user data from server every time dialog opens
  const { data: freshData, isLoading: isFetching } = useQuery({
    queryKey: ["/api/users", currentUser?.id],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/users/${currentUser!.id}`);
      return r.json() as Promise<{ user: UserType }>;
    },
    enabled: open && !!currentUser?.id && currentUser.role !== "trainer",
    staleTime: 0,
  });

  // Merge fresh data into store when loaded
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
      });
    }
    if (!open) setEditing(false);
  }, [user, open, form]);

  const watchedBirthDate = useWatch({ control: form.control, name: "birthDate" });
  const editAge = useMemo(() => calculateAge(watchedBirthDate), [watchedBirthDate]);
  const editRequiresParent = editAge !== null && editAge < 14;

  const viewAge = useMemo(() => calculateAge(user?.birthDate), [user?.birthDate]);
  const viewRequiresParent = viewAge !== null && viewAge < 14;
  const viewHasParentData = !!(user?.parentFullName || user?.parentPhone);

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
    if (editRequiresParent) {
      if (!values.parentFullName?.trim() || !values.parentPhone?.trim()) {
        toast({
          title: "Заполните данные законного представителя",
          description: "Для учеников младше 14 лет необходимо указать ФИО и телефон представителя",
          variant: "destructive",
        });
        return;
      }
    }
    mutation.mutate(values);
  };

  if (!currentUser || currentUser.role === "trainer") return null;

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

                {(viewRequiresParent || viewHasParentData) && (
                  <>
                    <Separator />
                    <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">
                        Законный представитель
                        {viewRequiresParent && <span className="ml-1">(обязательно, возраст &lt; 14 лет)</span>}
                      </p>
                      <InfoRow icon={<Users className="h-4 w-4" />} label="ФИО" value={user?.parentFullName} />
                      <InfoRow icon={<Phone className="h-4 w-4" />} label="Телефон" value={user?.parentPhone} />
                    </div>
                  </>
                )}

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

                  <div className={editRequiresParent
                    ? "rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3"
                    : "space-y-3"}>
                    <p className="text-sm font-medium">
                      Законный представитель{" "}
                      <span className="text-muted-foreground font-normal text-xs">
                        {editRequiresParent
                          ? "(обязательно — возраст менее 14 лет)"
                          : "(необязательно)"}
                      </span>
                    </p>
                    <FormField control={form.control} name="parentFullName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>ФИО{editRequiresParent ? " *" : ""}</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ""} placeholder="Иванов Иван Иванович" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="parentPhone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Телефон{editRequiresParent ? " *" : ""}</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ""} placeholder="79991234567" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

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
