import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { User, Pencil, Save, X, Phone, CalendarDays, Users, UserCircle2 } from "lucide-react";
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
    if (currentUser && open) {
      form.reset({
        firstName: currentUser.firstName ?? "",
        lastName: currentUser.lastName ?? "",
        middleName: currentUser.middleName ?? "",
        birthDate: currentUser.birthDate ?? "",
        phone: currentUser.phone ?? "",
        parentFullName: currentUser.parentFullName ?? "",
        parentPhone: currentUser.parentPhone ?? "",
      });
    }
    if (!open) setEditing(false);
  }, [currentUser, open, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const response = await apiRequest("PATCH", "/api/users/me", { userId: currentUser?.id, ...values });
      return response.json();
    },
    onSuccess: (data) => {
      setUser(data.user as UserType);
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      toast({ title: "Профиль сохранён" });
      setEditing(false);
    },
    onError: (error: any) => {
      toast({ title: "Не удалось сохранить", description: error?.message || "Попробуйте ещё раз", variant: "destructive" });
    },
  });

  if (!currentUser || currentUser.role === "trainer") return null;

  const initials = `${currentUser.firstName?.[0] ?? ""}${currentUser.lastName?.[0] ?? ""}`.trim() || "У";
  const fullName = [currentUser.lastName, currentUser.firstName, currentUser.middleName].filter(Boolean).join(" ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-blue-600" />
            Мой профиль
          </DialogTitle>
        </DialogHeader>

        {/* Avatar + name */}
        <div className="flex items-center gap-4 rounded-xl border bg-muted/40 p-4">
          <Avatar className="h-14 w-14 text-lg">
            <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold text-base leading-tight">{fullName || currentUser.firstName}</div>
            <div className="text-sm text-muted-foreground">{currentUser.phone}</div>
          </div>
        </div>

        {/* VIEW MODE */}
        {!editing && (
          <div className="space-y-1">
            <InfoRow icon={<User className="h-4 w-4" />} label="Имя" value={currentUser.firstName} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Фамилия" value={currentUser.lastName} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Отчество" value={currentUser.middleName} />
            <Separator />
            <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="Дата рождения" value={formatDate(currentUser.birthDate)} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Телефон" value={currentUser.phone} />
            <Separator />
            <InfoRow icon={<Users className="h-4 w-4" />} label="ФИО родителя" value={currentUser.parentFullName} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Телефон родителя" value={currentUser.parentPhone} />

            <div className="flex justify-end pt-2">
              <Button onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" />Редактировать
              </Button>
            </div>
          </div>
        )}

        {/* EDIT MODE */}
        {editing && (
          <Form {...form}>
            <form className="grid gap-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
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
                      <Input
                        type="date"
                        {...field}
                        value={field.value ?? ""}
                        className="block"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Телефон *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <Separator />

              <FormField control={form.control} name="parentFullName" render={({ field }) => (
                <FormItem><FormLabel>ФИО родителя</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="parentPhone" render={({ field }) => (
                <FormItem><FormLabel>Телефон родителя</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />

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
      </DialogContent>
    </Dialog>
  );
}
