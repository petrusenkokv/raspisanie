import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar as CalIcon, X } from "lucide-react";
import { addDays, addMonths, format } from "date-fns";
import { ru } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type BlockedPeriod = {
  id: string;
  startDate: string;
  endDate: string;
  daysCount: number;
};

type SlotLite = {
  isBlocked: boolean;
  blockReason?: string | null;
};

type MonthScheduleDay = {
  date: string;
  timeSlots: SlotLite[];
};

const buildPeriodsFromDates = (dates: string[]): BlockedPeriod[] => {
  const sorted = Array.from(new Set(dates)).sort();
  const periods: BlockedPeriod[] = [];
  for (const date of sorted) {
    const last = periods[periods.length - 1];
    if (!last) {
      periods.push({ id: `${date}:${date}`, startDate: date, endDate: date, daysCount: 1 });
      continue;
    }
    const expectedNext = format(
      addDays(new Date(`${last.endDate}T12:00:00`), 1),
      "yyyy-MM-dd",
    );
    const sameMonth = last.endDate.slice(0, 7) === date.slice(0, 7);
    if (date === expectedNext && sameMonth) {
      last.endDate = date;
      last.daysCount += 1;
      last.id = `${last.startDate}:${last.endDate}`;
    } else {
      periods.push({ id: `${date}:${date}`, startDate: date, endDate: date, daysCount: 1 });
    }
  }
  return periods;
};

const loadBlockedPeriodsFallback = async (): Promise<BlockedPeriod[]> => {
  const now = new Date();
  const months = Array.from({ length: 8 }).map((_, idx) => addMonths(now, idx));
  const responses = await Promise.all(
    months.map((d) =>
      fetch(`/api/schedule/month/${format(d, "yyyy")}/${format(d, "M")}`, {
        credentials: "include",
      }),
    ),
  );
  for (const r of responses) {
    if (!r.ok) throw new Error("Не удалось загрузить закрытые периоды");
  }
  const monthPayloads = (await Promise.all(
    responses.map((r) => r.json()),
  )) as MonthScheduleDay[][];
  const blockedDates = monthPayloads
    .flat()
    .filter((day) => {
      if (!day.timeSlots || day.timeSlots.length === 0) return false;
      return day.timeSlots.every((s) => s.isBlocked);
    })
    .map((day) => day.date);
  return buildPeriodsFromDates(blockedDates);
};

export function BlockPeriodDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const periodsQuery = useQuery<{ periods: BlockedPeriod[] }>({
    queryKey: ["/api/trainer/blocked-periods"],
    enabled: open,
    queryFn: async () => {
      const response = await fetch("/api/trainer/blocked-periods", {
        credentials: "include",
      });
      if (response.ok) {
        return (await response.json()) as { periods: BlockedPeriod[] };
      }
      // Backward compatibility for deployments without new API route.
      if (response.status === 404) {
        const periods = await loadBlockedPeriodsFallback();
        return { periods };
      }
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message || "Не удалось загрузить список закрытых периодов");
    },
  });

  const periods = periodsQuery.data?.periods ?? [];
  const periodRows = useMemo(
    () => [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [periods],
  );
  const periodsErrorMessage =
    periodsQuery.error instanceof Error
      ? periodsQuery.error.message
      : "Не удалось загрузить список закрытых периодов";

  const blockMutation = useMutation({
    mutationFn: async (vars: { blocked: boolean }) => {
      const r = await apiRequest("POST", "/api/trainer/block-range", {
        startDate,
        endDate,
        blocked: vars.blocked,
      });
      return r.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/blocked-periods"] });
      toast({
        title: vars.blocked ? "Период закрыт" : "Период открыт",
        description: vars.blocked
          ? `Закрыто слотов: ${data.slotsCount}, отменено записей: ${data.cancelledCount}`
          : `Открыто слотов: ${data.slotsCount}`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (period: BlockedPeriod) => {
      const r = await apiRequest("POST", "/api/trainer/block-range", {
        startDate: period.startDate,
        endDate: period.endDate,
        blocked: false,
      });
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/blocked-periods"] });
      toast({
        title: "Период удален",
        description: `Открыто слотов: ${data.slotsCount}`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось удалить период", variant: "destructive" });
    },
    onSettled: () => {
      setDeletingKey(null);
    },
  });

  const handleDeletePeriod = (period: BlockedPeriod) => {
    const rangeLabel =
      period.startDate === period.endDate
        ? format(new Date(`${period.startDate}T12:00:00`), "d MMMM yyyy", { locale: ru })
        : `${format(new Date(`${period.startDate}T12:00:00`), "d MMM", { locale: ru })} — ${format(new Date(`${period.endDate}T12:00:00`), "d MMMM yyyy", { locale: ru })}`;
    const confirmed = window.confirm(
      `Удалить закрытый период "${rangeLabel}"?\nЭти даты снова станут доступными по обычному расписанию.`,
    );
    if (!confirmed) return;
    const key = period.id;
    setDeletingKey(key);
    deleteMutation.mutate(period);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalIcon className="h-5 w-5" />
            Отпуск / закрыть период
          </DialogTitle>
          <DialogDescription>
            1) Выберите даты и закройте период. 2) Ниже увидите все закрытые периоды и сможете удалить любой по крестику.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Используйте для отпуска или больничного. Все занятия в выбранные даты будут заблокированы для записи. Существующие записи учеников будут отменены.
          </p>
          <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 space-y-3">
            <div className="text-sm font-medium text-blue-900">Закрыть период</div>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
              <div className="space-y-1">
                <Label>Дата начала</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Дата окончания</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="invisible">Действие</Label>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white whitespace-nowrap w-full sm:w-auto"
                  onClick={() => blockMutation.mutate({ blocked: true })}
                  disabled={blockMutation.isPending || deleteMutation.isPending}
                >
                  {blockMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Выбрать
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-2">
            <div className="text-sm font-medium text-amber-900">Закрытые периоды</div>
            {periodsQuery.isLoading && (
              <div className="text-sm text-gray-500">Загрузка...</div>
            )}
            {periodsQuery.isError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {periodsErrorMessage}
              </div>
            )}
            {!periodsQuery.isLoading && !periodsQuery.isError && periodRows.length === 0 && (
              <div className="text-sm text-gray-500">Сейчас нет закрытых периодов.</div>
            )}
            {!periodsQuery.isError && periodRows.length > 0 && (
              <div className="max-h-52 overflow-auto space-y-2 pr-1">
                {periodRows.map((period) => {
                  const key = period.id;
                  const label =
                    period.startDate === period.endDate
                      ? format(new Date(`${period.startDate}T12:00:00`), "d MMMM yyyy", { locale: ru })
                      : `${format(new Date(`${period.startDate}T12:00:00`), "d MMM", { locale: ru })} — ${format(new Date(`${period.endDate}T12:00:00`), "d MMM yyyy", { locale: ru })}`;
                  const deleting = deletingKey === key && deleteMutation.isPending;
                  return (
                    <div key={key} className="flex items-center justify-between gap-3 rounded border p-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{label}</div>
                        <div className="text-xs text-gray-500">{period.daysCount} дн. закрыто</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePeriod(period)}
                        aria-label="Удалить период"
                        disabled={deleteMutation.isPending}
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 text-red-500" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={blockMutation.isPending || deleteMutation.isPending}
          >
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
