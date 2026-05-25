import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import { Loader2, UserCog, Phone, KeyRound } from "lucide-react";

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

  useEffect(() => {
    if (open && currentUser) {
      setPhone(formatPhoneDisplay(currentUser.phone ?? ""));
    }
    if (!open) {
      setOldPassword("");
      setNewPassword("");
      setRepeatPassword("");
    }
  }, [open, currentUser]);

  const phoneMutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizePhone(phone);
      if (!normalized) throw new Error("Введите корректный номер телефона (11 цифр, начиная с 7 или 8)");
      const res = await apiRequest("PATCH", "/api/trainer/profile", {
        userId: currentUser?.id,
        phone: normalized,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Ошибка при сохранении");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Номер телефона обновлён" });
      if (currentUser && data.user) {
        setUser({ ...currentUser, phone: data.user.phone });
      }
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Не удалось обновить телефон", description: error?.message });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (!oldPassword || !newPassword) throw new Error("Заполните все поля");
      if (newPassword.length < 4) throw new Error("Пароль не короче 4 символов");
      if (newPassword !== repeatPassword) throw new Error("Пароли не совпадают");
      const res = await apiRequest("POST", "/api/auth/change-password", {
        oldPassword,
        newPassword,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Ошибка при сохранении");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Пароль изменён" });
      setOldPassword("");
      setNewPassword("");
      setRepeatPassword("");
      if (currentUser) {
        setUser({ ...currentUser, mustChangePassword: false } as any);
      }
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Не удалось сменить пароль", description: error?.message });
    },
  });

  const handlePhoneSave = () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast({ variant: "destructive", title: "Некорректный номер", description: "Введите 11 цифр, начиная с 7 или 8" });
      return;
    }
    if (normalized === currentUser?.phone) {
      toast({ title: "Номер не изменился" });
      return;
    }
    phoneMutation.mutate();
  };

  const handlePasswordSave = () => {
    if (!oldPassword || !newPassword || !repeatPassword) {
      toast({ variant: "destructive", title: "Заполните все поля" });
      return;
    }
    if (newPassword.length < 4) {
      toast({ variant: "destructive", title: "Пароль не короче 4 символов" });
      return;
    }
    if (newPassword !== repeatPassword) {
      toast({ variant: "destructive", title: "Пароли не совпадают" });
      return;
    }
    passwordMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-blue-600" />
            Профиль тренера
          </DialogTitle>
          <DialogDescription>
            Изменение контактных данных и пароля
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Phone section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              <Phone className="h-4 w-4 text-blue-500" />
              Номер телефона
            </div>
            <div>
              <Label htmlFor="trainer-phone">Новый номер</Label>
              <Input
                id="trainer-phone"
                type="tel"
                placeholder="+7 (999) 123-45-67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              onClick={handlePhoneSave}
              disabled={phoneMutation.isPending}
              className="w-full"
            >
              {phoneMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить номер
            </Button>
          </div>

          <Separator />

          {/* Password section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              <KeyRound className="h-4 w-4 text-blue-500" />
              Смена пароля
            </div>
            <div>
              <Label htmlFor="trainer-old-pwd">Текущий пароль</Label>
              <Input
                id="trainer-old-pwd"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="trainer-new-pwd">Новый пароль</Label>
              <Input
                id="trainer-new-pwd"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="trainer-repeat-pwd">Повторите новый пароль</Label>
              <Input
                id="trainer-repeat-pwd"
                type="password"
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              onClick={handlePasswordSave}
              disabled={passwordMutation.isPending}
              variant="outline"
              className="w-full"
            >
              {passwordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сменить пароль
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
