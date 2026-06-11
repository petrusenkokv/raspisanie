import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

type PullToRefreshProps = {
  onRefresh: () => Promise<void>;
  enabled?: boolean;
  children: ReactNode;
};

export const PullToRefresh = ({ onRefresh, enabled = true, children }: PullToRefreshProps) => {
  const { pullDistance, refreshing, threshold, isPulling } = usePullToRefresh(onRefresh, enabled);
  const ready = pullDistance >= threshold;

  return (
    <div className="relative">
      <div
        className={cn(
          "pointer-events-none flex justify-center overflow-hidden transition-[height,opacity] duration-200",
          isPulling ? "opacity-100" : "opacity-0",
        )}
        style={{ height: isPulling ? Math.max(pullDistance, refreshing ? threshold : 0) : 0 }}
        aria-hidden={!isPulling}
      >
        <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <Loader2
            className={cn("h-4 w-4 shrink-0 text-blue-600", refreshing && "animate-spin")}
            aria-hidden
          />
          <span>
            {refreshing ? "Обновляем…" : ready ? "Отпустите для обновления" : "Потяните вниз"}
          </span>
        </div>
      </div>
      <div
        className={cn(!refreshing && isPulling && "transition-transform duration-150")}
        style={isPulling && !refreshing ? { transform: `translateY(${pullDistance}px)` } : undefined}
      >
        {children}
      </div>
    </div>
  );
};
