import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import { Loader2, UserCog } from "lucide-react";

interface TrainerProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatPhoneDisplay(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw;
}

function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 10) digits = "7" + digits;
  else if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length !== 11 || !digits.startsWith("7")) return null;
  return digits;
}

export function TrainerProfileDialog({ open, onOpenChange }: TrainerProfileDialogProps) {
  const { currentUser, setUser } = useGymStore();
  const { toast } = useToast();

  const [phone, setPhone] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [exemptMembership, setExemptMembership] = useState(false);
  const [exemptTrainerPayment, setExemptTrainerPayment] = useState(false);

  useEffect(() => {
    if (open && currentUser) {
      setPhone(formatPhoneDisplay(currentUser.phone ?? ""));
      setExemptMembership((currentUser as { exemptMembership?: boolean }).exemptMembership === true);
      setExemptTrainerPayment((currentUser as { exemptTrainerPayment?: boolean }).exemptTrainerPayment === true);
    }
    if (!open) {
      setOldPassword("");
      setNewPassword("");
      setRepeatPassword("");
    }
  }, [open, currentUser]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const passwordTouched = !!(oldPassword || newPassword || repeatPassword);
      const normalizedPhone = normalizePhone(phone);
      const phoneChanged = normalizedPhone !== null && normalizedPhone !== currentUser?.phone;
      const initialExemptMembership = (currentUser as { exemptMembership?: boolean })?.exemptMembership === true;
      const initialExemptTrainerPayment = (currentUser as { exemptTrainerPayment?: boolean })?.exemptTrainerPayment === true;
      const exemptChanged =
        exemptMembership !== initialExemptMembership ||
        exemptTrainerPayment !== initialExemptTrainerPayment;

      if (phoneChanged && !normalizedPhone) {
        throw new Error("Введите корректный номер телефона (11 цифр, начиная с 7 или 8)");
      }

      if (passwordTouched) {
        if (!oldPassword || !newPassword || !repeatPassword) {
          throw new Error("Заполните все поля для смены пароля");
        }
        if (newPassword.length < 4) {
          throw new Error("Пароль не короче 4 символов");
        }
        if (newPassword !== repeatPassword) {
          throw new Error("Пароли не совпадают");
        }
      }

      if (!phoneChanged && !exemptChanged && !passwordTouched) {
        return { changed: false as const };
      }

      let user = currentUser;

      if (phoneChanged || exemptChanged) {
        const payload: Record<string, unknown> = {};
        if (phoneChanged) {
          payload.phone = normalizedPhone;
          payload.userId = currentUser?.id;
        }
        if (exemptChanged) {
          payload.exemptMembership = exemptMembership;
          payload.exemptTrainerPayment = exemptTrainerPayment;
        }

        const res = await apiRequest("PATCH", "/api/trainer/profile", payload);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Ошибка сохранения профиля");
        }
        const data = await res.json();
        if (data.user) user = { ...currentUser!, ...data.user };
      }

      if (passwordTouched) {
        const res = await apiRequest("POST", "/api/auth/change-password", {
          oldPassword,
          newPassword,
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Ошибка при смене пароля");
        }
        user = { ...user!, mustChangePassword: false } as typeof user;
      }

      return { changed: true as const, user };
    },
    onSuccess: (result) => {
      if (!result.changed) {
        toast({ title: "Изменений нет" });
        return;
      }
      if (result.user && currentUser) {
        setUser({ ...currentUser, ...result.user });
      }
      setOldPassword("");
      setNewPassword("");
      setRepeatPassword("");
      toast({ title: "Сохранено" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Не удалось сохранить", description: error.message });
    },
  });

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-3 p-4 sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 space-y-1 pr-8">
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4 text-blue-600" />
            Профиль тренера
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="trainer-phone">Телефон</Label>
            <Input
              id="trainer-phone"
              type="tel"
              placeholder="+7 (999) 123-45-67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2 rounded-md border px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={exemptMembership}
                disabled={saveMutation.isPending}
                onCheckedChange={(v) => setExemptMembership(!!v)}
              />
              <span className="text-sm">Не показывать членский взнос (ЧВ/БВ)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={exemptTrainerPayment}
                disabled={saveMutation.isPending}
                onCheckedChange={(v) => setExemptTrainerPayment(!!v)}
              />
              <span className="text-sm">Не показывать оплату тренеру</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Смена пароля</p>
            <Input
              id="trainer-old-pwd"
              type="password"
              placeholder="Текущий пароль"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
            <Input
              id="trainer-new-pwd"
              type="password"
              placeholder="Новый пароль"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              id="trainer-repeat-pwd"
              type="password"
              placeholder="Повторите новый пароль"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={handleClose}
            disabled={saveMutation.isPending}
          >
            Закрыть
          </Button>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
