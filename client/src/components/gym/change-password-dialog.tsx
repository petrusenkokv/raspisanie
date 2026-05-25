import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useGymStore } from "@/store/gym-store";
import { Loader2, KeyRound } from "lucide-react";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forced?: boolean;
}

export function ChangePasswordDialog({ open, onOpenChange, forced }: ChangePasswordDialogProps) {
  const { currentUser, setUser } = useGymStore();
  const { toast } = useToast();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setOldPassword("");
      setNewPassword("");
      setRepeatPassword("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/change-password", {
        oldPassword,
        newPassword,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Пароль изменён" });
      if (currentUser) {
        setUser({ ...currentUser, mustChangePassword: false } as any);
      }
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Не удалось сменить пароль",
        description: error?.message || "Попробуйте ещё раз",
      });
    },
  });

  const handleSubmit = () => {
    if (!oldPassword || !newPassword) {
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
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (forced && !o) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-blue-600" />
            Сменить пароль
          </DialogTitle>
          <DialogDescription>
            {forced
              ? "Тренер задал вам временный пароль. Пожалуйста, придумайте свой."
              : "Введите текущий и новый пароль."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="old-pwd">Текущий пароль</Label>
            <Input
              id="old-pwd"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              data-testid="input-old-password"
            />
          </div>
          <div>
            <Label htmlFor="new-pwd">Новый пароль</Label>
            <Input
              id="new-pwd"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="input-new-password"
            />
          </div>
          <div>
            <Label htmlFor="repeat-pwd">Повторите новый пароль</Label>
            <Input
              id="repeat-pwd"
              type="password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              data-testid="input-repeat-password"
            />
          </div>
        </div>
        <DialogFooter>
          {!forced && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            data-testid="button-confirm-change-password"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
