import { useMemo, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionPriceBreakdown } from "@shared/consents-pricing";

type Summary = {
  sessionPrice: SessionPriceBreakdown;
  exemptTrainerPayment?: boolean;
};

const formatSlotPrice = (studentIds: string[]): string | null => {
  const ids = Array.from(new Set(studentIds.filter(Boolean)));
  if (ids.length === 0) return null;
  return ids.join(",");
};

const buildPriceTooltip = (prices: SessionPriceBreakdown[], label: string): ReactNode => {
  if (prices.length === 1) {
    const price = prices[0];
    return (
      <div className="space-y-1 text-xs max-w-[240px]">
        <p className="font-semibold">Стоимость одной тренировки</p>
        <p>
          {price.serviceName}: {price.basePriceRub} ₽
        </p>
        {price.surchargeRub > 0 && (
          <>
            <p>+ надбавка за согласия: {price.surchargeRub} ₽</p>
            <ul className="list-disc pl-4 text-muted-foreground">
              {price.surcharges.map((s) => (
                <li key={s.documentId}>
                  без «{s.title}»: +{s.amountRub} ₽
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="font-medium pt-0.5">Итого: {price.totalPriceRub} ₽</p>
        <p className="text-muted-foreground">
          Услуга и согласия настраиваются в профиле.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-xs max-w-[240px]">
      <p className="font-semibold">Стоимость тренировки</p>
      <p>
        {label} — минимальная цена среди записанных: у каждого ученика своя услуга и
        надбавки за согласия.
      </p>
      <p className="text-muted-foreground">Подробности — в профиле каждого ученика.</p>
    </div>
  );
};

type SlotSessionPriceProps = {
  studentIds: string[];
  inline?: boolean;
  className?: string;
};

export function SlotSessionPrice({
  studentIds,
  inline = false,
  className,
}: SlotSessionPriceProps) {
  const key = formatSlotPrice(studentIds);

  const queries = useQueries({
    queries: (key ? key.split(",") : []).map((id) => ({
      queryKey: ["/api/users", id, "account-summary", "slot-price"] as const,
      queryFn: async () => {
        const r = await apiRequest("GET", `/api/users/${id}/account-summary`);
        return r.json() as Promise<Summary>;
      },
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    })),
  });

  const { label, tooltipPrices } = useMemo(() => {
    if (!key) return { label: null as string | null, tooltipPrices: [] as SessionPriceBreakdown[] };
    if (queries.some((q) => q.isLoading)) {
      return { label: null, tooltipPrices: [] };
    }
    const prices = queries
      .map((q) => q.data)
      .filter((d): d is Summary => !!d && !d.exemptTrainerPayment)
      .map((d) => d.sessionPrice);
    if (prices.length === 0) return { label: null, tooltipPrices: [] };
    const totals = prices.map((p) => p.totalPriceRub);
    const unique = Array.from(new Set(totals));
    const labelText =
      unique.length === 1 ? `${unique[0]} ₽` : `от ${Math.min(...unique)} ₽`;
    return { label: labelText, tooltipPrices: prices };
  }, [key, queries]);

  if (!label) return null;

  const priceNode = inline ? (
    <span
      className={cn(
        "text-xs font-semibold text-blue-700 dark:text-blue-300 tabular-nums shrink-0",
        className,
      )}
      data-testid="slot-session-price"
    >
      {label}
    </span>
  ) : (
    <p
      className={cn(
        "text-sm font-semibold text-blue-700 dark:text-blue-300 text-center tabular-nums",
        className,
      )}
      data-testid="slot-session-price"
    >
      {label}
    </p>
  );

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex cursor-help", !inline && "w-full justify-center")}
          tabIndex={0}
          aria-label={`Стоимость тренировки: ${label}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {priceNode}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="z-[100]">
        {buildPriceTooltip(tooltipPrices, label)}
      </TooltipContent>
    </Tooltip>
  );
}
