import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_INDIVIDUAL_TRAINING_PRICE_RUB } from "@shared/pricing-tiers";

type Props = {
  userId: string;
  enabled: boolean;
  /** Подпись под заголовком (по умолчанию для карточки ученика). */
  hint?: string;
};

export function IndividualTrainingToggle({ userId, enabled, hint }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settingsData } = useQuery<{ individualTrainingPriceRub?: number }>({
    queryKey: ["/api/schedule/settings"],
    staleTime: 60_000,
  });
  const individualPrice =
    settingsData?.individualTrainingPriceRub ?? DEFAULT_INDIVIDUAL_TRAINING_PRICE_RUB;

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
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Индивидуальная тренировка</p>
        <p className="text-xs text-gray-500">
          {hint ??
            "Цена за занятие задаётся в настройках тренера. Запись возможна только в свободный слот."}
        </p>
        {enabled && (
          <p className="mt-1.5 w-fit inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            {individualPrice.toLocaleString("ru-RU")} ₽ за занятие
          </p>
        )}
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