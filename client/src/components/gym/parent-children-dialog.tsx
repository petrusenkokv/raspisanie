import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
import { Dumbbell, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import type { User } from "@shared/schema";

type ChildForm = {
  id?: string;
  firstName: string;
  lastName: string;
  middleName: string;
  birthDate: string;
  phone: string;
  parentFullName: string;
  parentPhone: string;
  legalRepresentativeConfirmed?: boolean;
};

const EMPTY_FORM: ChildForm = {
  firstName: "",
  lastName: "",
  middleName: "",
  birthDate: "",
  phone: "",
  parentFullName: "",
  parentPhone: "",
};

export function ParentChildrenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { currentUser, setUser } = useGymStore();
  const [editing, setEditing] = useState<ChildForm>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmEnableOpen, setConfirmEnableOpen] = useState(false);
  const [legalRepresentativeConfirmed, setLegalRepresentativeConfirmed] = useState(false);

  const isAlsoStudent = !!currentUser?.isAlsoStudent;
  const isParentRole = currentUser?.role === "parent";

  const { data: children = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/parent/children"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/parent/children");
      return r.json();
    },
    enabled: open,
    staleTime: 0,
  });

  const toggleSelfMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await apiRequest("PATCH", "/api/parent/enable-self-booking", { enabled });
      return r.json();
    },
    onSuccess: (data) => {
      if (data?.user) setUser(data.user as User);
      queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
      toast({
        title: data?.user?.isAlsoStudent
          ? "Теперь вы можете записываться на тренировки"
          : "Запись на тренировки отключена",
      });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Ошибка", description: e?.message });
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: ChildForm) => {
      if (payload.id) {
        const r = await apiRequest("PATCH", `/api/parent/children/${payload.id}`, payload);
        return r.json();
      }
      const r = await apiRequest("POST", "/api/parent/children", payload);
      return r.json();
    },
    onSuccess: (_data, payload) => {
      toast({ title: "Сохранено" });
      // After adding a child, always clear phone input to avoid reusing previous number.
      if (!payload.id) {
        setEditing({ ...EMPTY_FORM, phone: "" });
        setLegalRepresentativeConfirmed(false);
        setFormOpen(false);
      } else {
        setEditing(EMPTY_FORM);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/parent/children"] });
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: e?.message || "Не удалось сохранить данные ребёнка",
      });
    },
  });

  const handleEdit = (child: User) => {
    setEditing({
      id: child.id,
      firstName: child.firstName ?? "",
      lastName: child.lastName ?? "",
      middleName: child.middleName ?? "",
      birthDate: child.birthDate ?? "",
      phone: child.phone ?? "",
      parentFullName: child.parentFullName ?? "",
      parentPhone: child.parentPhone ?? "",
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!editing.firstName.trim() || !editing.lastName.trim()) {
      toast({ variant: "destructive", title: "Заполните имя и фамилию" });
      return;
    }
    if (!editing.id && !legalRepresentativeConfirmed) {
      toast({
        variant: "destructive",
        title: "Подтвердите законного представителя",
        description: "Поставьте галочку, что вы являетесь законным представителем ребёнка.",
      });
      return;
    }
    upsertMutation.mutate({
      ...editing,
      ...(editing.id ? {} : { legalRepresentativeConfirmed }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Мои дети
          </DialogTitle>
        </DialogHeader>

        {(isAlsoStudent || !isParentRole) ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/30 p-4 flex items-start gap-4">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/40 p-2 shrink-0">
              <Dumbbell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Вы тренируетесь с тренером</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Запись на тренировки — в расписании, кнопка «Записать себя». Здесь можно добавить детей, если понадобится.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border p-4 flex items-start gap-4">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/40 p-2 shrink-0">
              <Dumbbell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Хочу тренироваться</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Включите, чтобы записывать себя на тренировки тем же аккаунтом.
              </p>
            </div>
            <Switch
              checked={false}
              onCheckedChange={(checked) => {
                if (!checked) return;
                setConfirmEnableOpen(true);
              }}
              disabled={toggleSelfMutation.isPending}
              aria-label="Хочу тренироваться"
            />
          </div>
        )}

        <Separator />

        {/* ── Список детей ── */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Добавьте ребёнка или отредактируйте существующую карточку.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!formOpen) {
                setEditing(EMPTY_FORM);
                setLegalRepresentativeConfirmed(false);
                setFormOpen(true);
                return;
              }
              // If currently editing an existing child, switch to clean "new child" form.
              if (editing.id) {
                setEditing(EMPTY_FORM);
                setLegalRepresentativeConfirmed(false);
                return;
              }
              setFormOpen(false);
            }}
          >
            {!formOpen ? "Добавить ребёнка" : editing.id ? "Новый ребёнок" : "Скрыть форму"}
          </Button>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : (
            <div className="grid gap-2">
              {children.map((child) => (
                <Card key={child.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {child.lastName} {child.firstName} {child.middleName ?? ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{child.phone}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(child)}>
                    Редактировать
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Форма добавления/редактирования ── */}
        {formOpen && (
          <div className="space-y-3 border rounded-lg p-3">
          <p className="text-sm font-semibold">
            {editing.id ? "Редактирование ребёнка" : "Добавить ребёнка"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Фамилия</Label>
              <Input
                value={editing.lastName}
                onChange={(e) => setEditing((s) => ({ ...s, lastName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Имя</Label>
              <Input
                value={editing.firstName}
                onChange={(e) => setEditing((s) => ({ ...s, firstName: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Отчество</Label>
              <Input
                value={editing.middleName}
                onChange={(e) => setEditing((s) => ({ ...s, middleName: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Дата рождения</Label>
              <Input
                type="date"
                value={editing.birthDate}
                onChange={(e) => setEditing((s) => ({ ...s, birthDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Телефон ребёнка (необязательно)</Label>
            <Input
              value={editing.phone}
              onChange={(e) => setEditing((s) => ({ ...s, phone: e.target.value }))}
              placeholder="Если пусто — будет служебный номер"
            />
          </div>
          {!editing.id && (
            <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer">
              <Checkbox
                checked={legalRepresentativeConfirmed}
                onCheckedChange={(checked) => setLegalRepresentativeConfirmed(checked === true)}
              />
              <span className="text-sm leading-snug">
                Я являюсь законным представителем ребёнка
              </span>
            </label>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setEditing(EMPTY_FORM);
                setLegalRepresentativeConfirmed(false);
                setFormOpen(false);
              }}
            >
              Очистить
            </Button>
            <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
              {editing.id ? "Сохранить" : "Добавить"}
            </Button>
          </div>
          </div>
        )}

        <AlertDialog open={confirmEnableOpen} onOpenChange={setConfirmEnableOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Вы подали заявку тренеру</AlertDialogTitle>
              <AlertDialogDescription>
                После подтверждения тренер увидит, что вы хотите тренироваться с тренером.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отменить</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => toggleSelfMutation.mutate(true)}
                disabled={toggleSelfMutation.isPending}
              >
                Подтвердить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
