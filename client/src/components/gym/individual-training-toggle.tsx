import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Props = {
  userId: string;
  enabled: boolean;
  /** Подпись под заголовком (по умолчанию для карточки ученика). */
  hint?: string;
};

export function IndividualTrainingToggle({ userId, enabled, hint }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const r = await apiRequest("PATCH", `/api/users/${userId}/individual-training`, {
        enabled: next,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "account-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      toast({ title: "Настройка сохранена" });
    },
    onError: (e: any) =>
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3 min-w-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">Индивидуальная тренировка</p>
        <p className="text-xs text-gray-500">
          {hint ??
            "Цена за занятие задаётся в настройках тренера. Запись возможна только в свободный слот."}
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => mutation.mutate(v)}
        disabled={mutation.isPending}
        data-testid="switch-individual-training"
        className="shrink-0"
      />
    </div>
  );
}