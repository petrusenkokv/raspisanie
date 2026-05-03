import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Camera, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import { updateStudentProfileSchema, type User as UserType } from "@shared/schema";

type FormValues = typeof updateStudentProfileSchema._type;

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentUser, setUser } = useGymStore();
  const { toast } = useToast();
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
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Не удалось сохранить профиль", description: error?.message || "Попробуйте ещё раз", variant: "destructive" });
    },
  });

  if (!currentUser || currentUser.role === "trainer") return null;

  const initials = `${currentUser.firstName?.[0] ?? ""}${currentUser.lastName?.[0] ?? ""}`.trim() || "U";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Мой профиль
          </DialogTitle>
          <DialogDescription>Обновите личные данные и контакты.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-blue-100 text-blue-700">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-sm">
            <div className="font-medium">{currentUser.firstName} {currentUser.lastName}</div>
            <div className="text-muted-foreground">{currentUser.phone}</div>
          </div>
        </div>
        <Form {...form}>
          <form className="grid gap-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="firstName" render={({ field }) => <FormItem><FormLabel>Имя</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="lastName" render={({ field }) => <FormItem><FormLabel>Фамилия</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            </div>
            <FormField control={form.control} name="middleName" render={({ field }) => <FormItem><FormLabel>Отчество</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="birthDate" render={({ field }) => <FormItem><FormLabel>Дата рождения</FormLabel><FormControl><Input {...field} placeholder="YYYY-MM-DD" /></FormControl><FormDescription>Формат: 2026-05-03</FormDescription><FormMessage /></FormItem>} />
              <FormField control={form.control} name="phone" render={({ field }) => <FormItem><FormLabel>Телефон</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            </div>
            <FormField control={form.control} name="parentFullName" render={({ field }) => <FormItem><FormLabel>ФИО родителя</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="parentPhone" render={({ field }) => <FormItem><FormLabel>Телефон родителя</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
              <Button type="submit" disabled={mutation.isPending}>
                <Camera className="h-4 w-4 mr-2" />
                Сохранить
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}