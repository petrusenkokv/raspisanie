import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
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

  const label = useMemo(() => {
    if (!key) return null;
    if (queries.some((q) => q.isLoading)) return null;
    const prices = queries
      .map((q) => q.data)
      .filter((d): d is Summary => !!d && !d.exemptTrainerPayment)
      .map((d) => d.sessionPrice);
    if (prices.length === 0) return null;
    const unique = Array.from(new Set(prices.map((p) => p.totalPriceRub)));
    return unique.length === 1 ? `${unique[0]} ₽` : `от ${Math.min(...unique)} ₽`;
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

  return priceNode;
}
