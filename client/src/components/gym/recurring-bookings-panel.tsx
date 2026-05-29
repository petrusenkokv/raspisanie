import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Calendar, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { todayLocalStr } from "@/lib/utils-gym";
import type { RecurringBooking } from "@shared/schema";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function RecurringBookingsPanel({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [hour, setHour] = useState<number>(18);
  const [startDate, setStartDate] = useState<string>(todayLocalStr());
  const [endDate, setEndDate] = useState<string>("");

  const { data: rules = [], isLoading } = useQuery<RecurringBooking[]>({
    queryKey: ["/api/trainer/recurring", studentId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/trainer/recurring/${studentId}`);
      return r.json();
    },
    enabled: !!studentId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/trainer/recurring", {
        studentId,
        weekdays,
        hour,
        startDate,
        endDate: endDate || null,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/recurring", studentId] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Повторяющаяся запись создана" });
      setWeekdays([]);
      setEndDate("");
    },
    onError: (e: Error) =>
      toast({ title: "Не удалось создать", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/trainer/recurring/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/recurring", studentId] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Правило удалено", description: "Будущие записи отменены" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const handleToggleDay = (iso: number) => {
    setWeekdays((prev) =>
      prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort(),
    );
  };

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <p className="font-medium text-sm flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        Повторяющиеся записи
      </p>

      {isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <p className="text-xs text-gray-500">Нет регулярных тренировок</p>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-800 rounded p-2"
            >
              <div className="space-y-1">
                <div>
                  <span className="font-medium">
                    {r.weekdays
                      .slice()
                      .sort()
                      .map((d) => WEEKDAY_LABELS[d - 1])
                      .join(", ")}
                  </span>{" "}
                  в {String(r.hour).padStart(2, "0")}:00
                </div>
                <div className="text-gray-500">
                  с {format(new Date(r.startDate), "d MMM yyyy", { locale: ru })}
                  {r.endDate
                    ? ` по ${format(new Date(r.endDate), "d MMM yyyy", { locale: ru })}`
                    : " (бессрочно)"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (confirm("Удалить правило? Все будущие записи будут отменены.")) {
                    deleteMutation.mutate(r.id);
                  }
                }}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-recurring-${r.id}`}
                aria-label="Удалить правило"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <p className="text-xs font-medium">Добавить правило</p>
        <div>
          <Label className="text-xs">Дни недели</Label>
          <div className="flex gap-1 mt-1 flex-wrap">
            {WEEKDAY_LABELS.map((label, i) => {
              const iso = i + 1;
              const active = weekdays.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handleToggleDay(iso)}
                  className={`px-2 py-1 text-xs rounded border transition ${
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white dark:bg-gray-900 border-gray-300 hover:bg-gray-100"
                  }`}
                  data-testid={`button-weekday-${iso}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Час</Label>
            <select
              className="w-full text-sm border rounded px-2 py-1 bg-white dark:bg-gray-900"
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              data-testid="select-recurring-hour"
            >
              {Array.from({ length: 12 }).map((_, i) => {
                const h = 8 + i;
                return (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <Label className="text-xs">С</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm"
              data-testid="input-recurring-start"
            />
          </div>
          <div>
            <Label className="text-xs">По (необяз.)</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm"
              data-testid="input-recurring-end"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || weekdays.length === 0 || !startDate}
          data-testid="button-create-recurring"
        >
          {createMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
          Создать правило
        </Button>
      </div>
    </div>
  );
}
