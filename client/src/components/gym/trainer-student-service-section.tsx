import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TrainerService } from "@shared/schema";

type AccountSummary = {
  sessionPrice: {
    serviceId: string | null;
    serviceName: string;
    totalPriceRub: number;
    basePriceRub: number;
    surchargeRub: number;
  };
};

type Props = {
  studentId: string;
  enabled?: boolean;
};

export function TrainerStudentServiceSection({ studentId, enabled = true }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const summaryKey = ["/api/users", studentId, "account-summary"] as const;

  const { data: summary, isLoading: summaryLoading } = useQuery<AccountSummary>({
    queryKey: summaryKey,
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/users/${studentId}/account-summary`);
      return r.json();
    },
    enabled: enabled && !!studentId,
    staleTime: 0,
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery<TrainerService[]>({
    queryKey: ["/api/trainer/services"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/trainer/services");
      return r.json();
    },
    enabled,
    staleTime: 0,
  });

  const activeServices = useMemo(
    () => services.filter((s) => s.isActive),
    [services],
  );

  const serviceMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      const r = await apiRequest("PATCH", `/api/users/${studentId}/selected-service`, {
        serviceId,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: summaryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/users", studentId, "account-summary"] });
      queryClient.invalidateQueries({ queryKey: ["session-price"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId] });
      toast({ title: "Услуга сохранена" });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  if (!enabled || !studentId) return null;

  if (summaryLoading || servicesLoading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
      </div>
    );
  }

  if (activeServices.length === 0) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Нет активных услуг. Добавьте их в Настройки → Цены.
      </p>
    );
  }

  const price = summary?.sessionPrice;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-white dark:bg-gray-900">
      <p className="text-sm font-medium">Услуга и стоимость</p>
      <div className="space-y-1">
        <Label className="text-xs">Услуга ученика</Label>
        <Select
          value={price?.serviceId ?? activeServices[0]?.id}
          onValueChange={(v) => serviceMutation.mutate(v)}
          disabled={serviceMutation.isPending}
        >
          <SelectTrigger className="h-9" data-testid="trainer-select-student-service">
            <SelectValue placeholder="Выберите услугу" />
          </SelectTrigger>
          <SelectContent>
            {activeServices.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} — {s.priceRub} ₽
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {price && (
        <p className="text-xs text-muted-foreground">
          Цена за тренировку для ученика:{" "}
          <span className="font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
            {price.totalPriceRub} ₽
          </span>
          {price.surchargeRub > 0 && ` (база ${price.basePriceRub} ₽ + ${price.surchargeRub} ₽)`}
        </p>
      )}
    </div>
  );
}

type NewStudentServiceProps = {
  services: TrainerService[];
  selectedServiceId: string;
  onServiceChange: (id: string) => void;
  previewTotalRub: number | null;
  serviceName: string;
};

export function TrainerNewStudentServiceFields({
  services,
  selectedServiceId,
  onServiceChange,
  previewTotalRub,
  serviceName,
}: NewStudentServiceProps) {
  const active = services.filter((s) => s.isActive);
  if (active.length === 0) return null;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-white dark:bg-gray-900">
      <p className="text-sm font-medium">Услуга</p>
      {active.length === 1 ? (
        <p className="text-sm">
          {active[0].name} — {active[0].priceRub} ₽
        </p>
      ) : (
        <Select value={selectedServiceId} onValueChange={onServiceChange}>
          <SelectTrigger className="h-9" data-testid="trainer-select-new-student-service">
            <SelectValue placeholder="Выберите услугу" />
          </SelectTrigger>
          <SelectContent>
            {active.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} — {s.priceRub} ₽
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {previewTotalRub != null && (
        <p className="text-xs text-muted-foreground">
          Цена за тренировку ({serviceName}):{" "}
          <span className="font-semibold text-blue-700 dark:text-blue-300">{previewTotalRub} ₽</span>
        </p>
      )}
    </div>
  );
}
