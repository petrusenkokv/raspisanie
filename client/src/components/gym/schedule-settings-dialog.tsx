import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus, CalendarOff, Clock, MessageSquare, Send, Lock, Unlock, Banknote } from "lucide-react";
import { TrainerServicesSection } from "./trainer-services-section";
import { TrainerPricingSettings } from "./trainer-pricing-settings";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { type WeeklyTemplate, type WeekdayTemplateEntry, type Holiday } from "@shared/schema";

interface ScheduleSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenBlockPeriod?: () => void;
  onOpenBroadcast?: () => void;
  dayBlockedState?: { allBlocked: boolean; dateStr: string } | null;
  blockDayPending?: boolean;
  onToggleBlockDay?: () => void;
}

const WEEKDAY_LABELS: Record<string, string> = {
  "1": "Понедельник",
  "2": "Вторник",
  "3": "Среда",
  "4": "Четверг",
  "5": "Пятница",
  "6": "Суббота",
  "7": "Воскресенье",
};

type SettingsResponse = {
  id: string;
  dayStartHour: number;
  dayEndHour: number;
  weeklyTemplate: WeeklyTemplate;
  cancelDeadlineHours: number;
  bookingDeadlineHours: number;
  defaultCapacity: number;
  reminderMinutes: number | null;
  welcomeMessage: string | null;
  holidays: Holiday[];
};

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ScheduleSettingsDialog({
  open,
  onOpenChange,
  onOpenBlockPeriod,
  onOpenBroadcast,
  dayBlockedState,
  blockDayPending,
  onToggleBlockDay,
}: ScheduleSettingsDialogProps) {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/schedule/settings"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/schedule/settings");
      return r.json();
    },
    enabled: open,
    staleTime: 0,
  });

  const [dayStart, setDayStart] = useState(8);
  const [dayEnd, setDayEnd] = useState(20);
  const [template, setTemplate] = useState<WeeklyTemplate>({});
  const [cancelDeadline, setCancelDeadline] = useState(3);
  const [bookingDeadline, setBookingDeadline] = useState(1);
  const [defaultCapacity, setDefaultCapacity] = useState(2);
  const [reminderMinutes, setReminderMinutes] = useState<string>("off");
  const [welcomeMessage, setWelcomeMessage] = useState<string>("");
  const [newHolidayDate, setNewHolidayDate] = useState<string>(todayLocalStr());
  const [newHolidayName, setNewHolidayName] = useState<string>("");

  useEffect(() => {
    if (data) {
      setDayStart(data.dayStartHour);
      setDayEnd(data.dayEndHour);
      setCancelDeadline(data.cancelDeadlineHours ?? 0);
      setBookingDeadline(data.bookingDeadlineHours ?? 0);
      setDefaultCapacity(data.defaultCapacity ?? 2);
      setReminderMinutes(data.reminderMinutes != null ? String(data.reminderMinutes) : "off");
      setWelcomeMessage(data.welcomeMessage ?? "");
      // Fill in any missing weekdays with default working values
      const next: WeeklyTemplate = { ...data.weeklyTemplate };
      for (let i = 1; i <= 7; i++) {
        const k = String(i) as keyof WeeklyTemplate;
        if (!next[k]) {
          next[k] = { enabled: true, startHour: data.dayStartHour, endHour: data.dayEndHour };
        }
      }
      setTemplate(next);
    }
  }, [data]);

  const saveSettings = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("PATCH", "/api/trainer/settings", payload);
      return r.json();
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/settings"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      const cancelled = res?.cancelledCount || 0;
      toast({
        title: "Настройки сохранены",
        description: cancelled > 0 ? `Отменено записей: ${cancelled}` : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/trainer/holidays", {
        date: newHolidayDate,
        name: newHolidayName.trim() || null,
      });
      return r.json();
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/settings"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({
        title: "Праздник добавлен",
        description: res?.cancelledCount > 0 ? `Отменено записей: ${res.cancelledCount}` : undefined,
      });
      setNewHolidayName("");
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/trainer/holidays/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule/settings"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Праздник удалён" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const updateDayEntry = (key: string, patch: Partial<WeekdayTemplateEntry>) => {
    setTemplate((prev) => ({
      ...prev,
      [key]: { ...(prev[key as "1"] || { enabled: true, startHour: dayStart, endHour: dayEnd }), ...patch },
    }));
  };

  const handleSaveHours = () => {
    if (dayEnd <= dayStart) {
      toast({ title: "Ошибка", description: "Окончание должно быть позже начала", variant: "destructive" });
      return;
    }
    saveSettings.mutate({
      dayStartHour: dayStart,
      dayEndHour: dayEnd,
      defaultCapacity,
    });
  };

  const handleSaveTemplate = () => {
    // Validate each day
    for (const k of Object.keys(template)) {
      const e = template[k as "1"];
      if (!e || !e.enabled) continue;
      if (e.endHour <= e.startHour) {
        toast({ title: "Ошибка", description: `${WEEKDAY_LABELS[k]}: окончание должно быть позже начала`, variant: "destructive" });
        return;
      }
      const bs = e.breakStartHour;
      const be = e.breakEndHour;
      if ((bs == null) !== (be == null)) {
        toast({ title: "Ошибка", description: `${WEEKDAY_LABELS[k]}: задайте начало и конец перерыва`, variant: "destructive" });
        return;
      }
      if (bs != null && be != null) {
        if (be <= bs) {
          toast({ title: "Ошибка", description: `${WEEKDAY_LABELS[k]}: конец перерыва должен быть позже начала`, variant: "destructive" });
          return;
        }
        if (bs < e.startHour || be > e.endHour) {
          toast({ title: "Ошибка", description: `${WEEKDAY_LABELS[k]}: перерыв должен быть внутри рабочих часов`, variant: "destructive" });
          return;
        }
      }
    }
    saveSettings.mutate({ weeklyTemplate: template });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-2xl sm:w-full max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-base sm:text-lg leading-snug">Настройки расписания</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Рабочие часы, шаблон недели, лимиты и праздники. Внизу — закрытие дня, отпуск и рассылка.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <Tabs defaultValue="hours" className="w-full min-w-0">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 sm:flex sm:flex-wrap">
              <TabsTrigger
                value="hours"
                data-testid="tab-hours"
                className="h-auto min-h-9 px-2 py-2 text-xs leading-tight whitespace-normal sm:text-sm"
              >
                <Clock className="h-3.5 w-3.5 shrink-0 sm:mr-1" />
                Часы
              </TabsTrigger>
              <TabsTrigger
                value="week"
                data-testid="tab-week"
                className="h-auto min-h-9 px-2 py-2 text-xs leading-tight whitespace-normal sm:text-sm"
              >
                Неделя
              </TabsTrigger>
              <TabsTrigger
                value="limits"
                data-testid="tab-limits"
                className="h-auto min-h-9 px-2 py-2 text-xs leading-tight whitespace-normal sm:text-sm"
              >
                Лимиты
              </TabsTrigger>
              <TabsTrigger
                value="holidays"
                data-testid="tab-holidays"
                className="h-auto min-h-9 px-2 py-2 text-xs leading-tight whitespace-normal sm:text-sm"
              >
                <CalendarOff className="h-3.5 w-3.5 shrink-0 sm:mr-1" />
                Праздники
              </TabsTrigger>
              <TabsTrigger
                value="welcome"
                data-testid="tab-welcome"
                className="h-auto min-h-9 px-2 py-2 text-xs leading-tight whitespace-normal sm:text-sm"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 sm:mr-1" />
                Привет
              </TabsTrigger>
              <TabsTrigger
                value="pricing"
                data-testid="tab-pricing"
                className="h-auto min-h-9 px-2 py-2 text-xs leading-tight whitespace-normal sm:text-sm"
              >
                <Banknote className="h-3.5 w-3.5 shrink-0 sm:mr-1" />
                Цены
              </TabsTrigger>
            </TabsList>

            {/* Working hours tab */}
            <TabsContent value="hours" className="space-y-4 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Диапазон часов, который виден в расписании. Внутри этого диапазона
                для каждого дня недели можно задать свой график (вкладка «Неделя»).
              </p>
              <div className="grid grid-cols-1 gap-4 min-w-0 sm:grid-cols-2">
                <div className="min-w-0">
                  <Label>Начало дня</Label>
                  <select
                    className="w-full min-w-0 border rounded px-3 py-2 bg-white dark:bg-gray-900"
                    value={dayStart}
                    onChange={(e) => setDayStart(Number(e.target.value))}
                    data-testid="select-day-start"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <Label>Конец дня</Label>
                  <select
                    className="w-full min-w-0 border rounded px-3 py-2 bg-white dark:bg-gray-900"
                    value={dayEnd}
                    onChange={(e) => setDayEnd(Number(e.target.value))}
                    data-testid="select-day-end"
                  >
                    {Array.from({ length: 24 }).map((_, i) => {
                      const h = i + 1;
                      return <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>;
                    })}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Например, 07:00 — 22:00 означает занятия с 7:00 до 21:00 включительно.
              </p>

              <div className="border-t pt-4 mt-4 space-y-2">
                <Label>Мест в час по умолчанию</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={defaultCapacity}
                  onChange={(e) =>
                    setDefaultCapacity(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                  }
                  data-testid="input-default-capacity"
                />
                <p className="text-xs text-gray-500">
                  Применяется ко всем часам, для которых не задано особое правило в шаблоне или вручную.
                </p>
              </div>

              <Button
                onClick={handleSaveHours}
                disabled={saveSettings.isPending}
                className="w-full"
                data-testid="button-save-hours"
              >
                {saveSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Сохранить
              </Button>
            </TabsContent>

            {/* Weekly template tab */}
            <TabsContent value="week" className="space-y-4 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Для каждого дня недели включите/выключите работу и задайте часы.
                Часы за пределами рабочего интервала автоматически заблокируются.
              </p>
              <div className="space-y-2">
                {(["1", "2", "3", "4", "5", "6", "7"] as const).map((k) => {
                  const entry = template[k] || { enabled: true, startHour: dayStart, endHour: dayEnd };
                  const breakOn = entry.breakStartHour != null && entry.breakEndHour != null;
                  const breakStart = entry.breakStartHour ?? 13;
                  const breakEnd = entry.breakEndHour ?? 14;
                  const capOverride = entry.capacity != null;
                  return (
                    <div
                      key={k}
                      className="border rounded p-3 space-y-3 min-w-0"
                      data-testid={`row-weekday-${k}`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-sm font-medium sm:w-28 shrink-0">{WEEKDAY_LABELS[k]}</div>
                          <Switch
                            checked={entry.enabled}
                            onCheckedChange={(checked) => updateDayEntry(k, { enabled: checked })}
                            data-testid={`switch-weekday-${k}`}
                          />
                          {!entry.enabled && (
                            <span className="text-sm text-gray-500 sm:ml-auto">Выходной</span>
                          )}
                        </div>
                        {entry.enabled && (
                          <div className="flex items-center gap-2 w-full min-w-0 sm:ml-auto sm:w-auto">
                            <select
                              className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-900"
                              value={entry.startHour}
                              onChange={(e) => updateDayEntry(k, { startHour: Number(e.target.value) })}
                              data-testid={`select-start-${k}`}
                            >
                              {Array.from({ length: 24 }).map((_, h) => (
                                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                              ))}
                            </select>
                            <span className="text-sm shrink-0">—</span>
                            <select
                              className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-900"
                              value={entry.endHour}
                              onChange={(e) => updateDayEntry(k, { endHour: Number(e.target.value) })}
                              data-testid={`select-end-${k}`}
                            >
                              {Array.from({ length: 24 }).map((_, i) => {
                                const h = i + 1;
                                return <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>;
                              })}
                            </select>
                          </div>
                        )}
                      </div>

                      {entry.enabled && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:pl-28">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0">Перерыв</span>
                            <Switch
                              checked={breakOn}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  const bs = Math.max(entry.startHour, Math.min(13, entry.endHour - 1));
                                  const be = Math.min(entry.endHour, bs + 1);
                                  updateDayEntry(k, { breakStartHour: bs, breakEndHour: be });
                                } else {
                                  updateDayEntry(k, { breakStartHour: null, breakEndHour: null });
                                }
                              }}
                              data-testid={`switch-break-${k}`}
                            />
                          </div>
                          {breakOn ? (
                            <div className="flex items-center gap-2 w-full min-w-0 sm:ml-auto sm:w-auto">
                              <select
                                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-900"
                                value={breakStart}
                                onChange={(e) => updateDayEntry(k, { breakStartHour: Number(e.target.value) })}
                                data-testid={`select-break-start-${k}`}
                              >
                                {Array.from({ length: entry.endHour - entry.startHour }).map((_, i) => {
                                  const h = entry.startHour + i;
                                  return <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>;
                                })}
                              </select>
                              <span className="text-sm shrink-0">—</span>
                              <select
                                className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-900"
                                value={breakEnd}
                                onChange={(e) => updateDayEntry(k, { breakEndHour: Number(e.target.value) })}
                                data-testid={`select-break-end-${k}`}
                              >
                                {Array.from({ length: entry.endHour - entry.startHour }).map((_, i) => {
                                  const h = entry.startHour + 1 + i;
                                  return <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>;
                                })}
                              </select>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500 sm:ml-auto">Без перерыва</span>
                          )}
                        </div>
                      )}

                      {entry.enabled && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:pl-28">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0">Мест в час</span>
                            <Switch
                              checked={capOverride}
                              onCheckedChange={(checked) =>
                                updateDayEntry(k, { capacity: checked ? defaultCapacity : null })
                              }
                              data-testid={`switch-capacity-${k}`}
                            />
                          </div>
                          {capOverride ? (
                            <Input
                              type="number"
                              min={1}
                              max={50}
                              value={entry.capacity ?? defaultCapacity}
                              onChange={(e) =>
                                updateDayEntry(k, {
                                  capacity: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                                })
                              }
                              className="w-full h-8 sm:ml-auto sm:w-24"
                              data-testid={`input-capacity-${k}`}
                            />
                          ) : (
                            <span className="text-xs text-gray-500 sm:ml-auto">
                              По умолчанию ({defaultCapacity})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Button
                onClick={handleSaveTemplate}
                disabled={saveSettings.isPending}
                className="w-full"
                data-testid="button-save-template"
              >
                {saveSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Применить шаблон
              </Button>
              <p className="text-xs text-gray-500">
                Существующие записи в часы, которые становятся нерабочими, будут отменены.
              </p>
            </TabsContent>

            {/* Limits tab — booking & cancel deadlines */}
            <TabsContent value="limits" className="space-y-4 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Запретить ученикам записываться или отменять запись слишком близко к началу тренировки.
                Установите 0, чтобы убрать ограничение.
              </p>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Закрыть запись за (часов до тренировки)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={168}
                    value={bookingDeadline}
                    onChange={(e) =>
                      setBookingDeadline(Math.max(0, Math.min(168, Number(e.target.value) || 0)))
                    }
                    data-testid="input-booking-deadline"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {bookingDeadline === 0
                      ? "Записаться можно вплоть до начала тренировки."
                      : `Ученик не сможет записаться, если до тренировки осталось ${bookingDeadline} ч. или меньше.`}
                  </p>
                </div>
                <div>
                  <Label>Закрыть отмену за (часов до тренировки)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={168}
                    value={cancelDeadline}
                    onChange={(e) =>
                      setCancelDeadline(Math.max(0, Math.min(168, Number(e.target.value) || 0)))
                    }
                    data-testid="input-cancel-deadline"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {cancelDeadline === 0
                      ? "Ученик может отменить запись в любое время."
                      : `Ученик не сможет отменить запись, если до тренировки осталось ${cancelDeadline} ч. или меньше. Тренер всегда может отменить.`}
                  </p>
                </div>
              </div>
              <div className="border-t pt-4 mt-2 space-y-2">
                <Label>Дополнительное напоминание о тренировке</Label>
                <select
                  className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-900"
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(e.target.value)}
                  data-testid="select-reminder-minutes"
                >
                  <option value="off">Не отправлять</option>
                  <option value="15">за 15 минут до начала</option>
                  <option value="30">за 30 минут до начала</option>
                  <option value="60">за 1 час до начала</option>
                  <option value="120">за 2 часа до начала</option>
                </select>
                <p className="text-xs text-gray-500">
                  Применяется ученикам и вам как тренеру. Это дополнительное напоминание —
                  стандартные оповещения за сутки и за час продолжают работать.
                </p>
              </div>
              <Button
                onClick={() =>
                  saveSettings.mutate({
                    bookingDeadlineHours: bookingDeadline,
                    cancelDeadlineHours: cancelDeadline,
                    reminderMinutes:
                      reminderMinutes === "off" ? null : Number(reminderMinutes),
                  })
                }
                disabled={saveSettings.isPending}
                className="w-full"
                data-testid="button-save-limits"
              >
                {saveSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Сохранить ограничения
              </Button>
            </TabsContent>

            {/* Holidays tab */}
            <TabsContent value="holidays" className="space-y-4 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Праздничные дни — расписание полностью закрыто. Все существующие записи на эти даты отменятся.
              </p>

              <div className="border rounded p-3 space-y-2">
                <p className="text-sm font-medium">Добавить праздник</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    <Label className="text-xs">Дата</Label>
                    <Input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      data-testid="input-holiday-date"
                    />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Название (необязательно)</Label>
                    <Input
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      placeholder="Например, Новый год"
                      data-testid="input-holiday-name"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => addHoliday.mutate()}
                  disabled={addHoliday.isPending || !newHolidayDate}
                  data-testid="button-add-holiday"
                >
                  {addHoliday.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                  <Plus className="h-3 w-3 mr-1" />
                  Добавить
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Список праздников {data.holidays.length > 0 && `(${data.holidays.length})`}
                </p>
                {data.holidays.length === 0 ? (
                  <p className="text-xs text-gray-500">Праздничных дней пока нет</p>
                ) : (
                  <div className="space-y-1">
                    {data.holidays.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800 rounded p-2 text-sm"
                        data-testid={`row-holiday-${h.id}`}
                      >
                        <div>
                          <div className="font-medium">
                            {format(new Date(h.date), "d MMMM yyyy, EEEE", { locale: ru })}
                          </div>
                          {h.name && <div className="text-xs text-gray-500">{h.name}</div>}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => deleteHoliday.mutate(h.id)}
                          disabled={deleteHoliday.isPending}
                          data-testid={`button-delete-holiday-${h.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            {/* Welcome message tab */}
            <TabsContent value="welcome" className="space-y-4 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Это сообщение ученик видит сразу после регистрации. Напишите контакты, правила зала и что делать дальше.
              </p>
              <div className="space-y-2">
                <Label>Текст приветственного сообщения</Label>
                <Textarea
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder={"Добро пожаловать!\n\nТренировки проходят по адресу: ...\nСвязаться со мной: ...\n\nЖдите одобрения заявки — после этого сможете записаться на занятие."}
                  rows={8}
                  maxLength={2000}
                  className="resize-none"
                  data-testid="textarea-welcome-message"
                />
                <p className="text-xs text-gray-500 text-right">{welcomeMessage.length}/2000</p>
              </div>
              <Button
                onClick={() => saveSettings.mutate({ welcomeMessage: welcomeMessage.trim() || null })}
                disabled={saveSettings.isPending}
                className="w-full"
                data-testid="button-save-welcome"
              >
                {saveSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Сохранить приветствие
              </Button>
              {!welcomeMessage.trim() && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  Если поле пустое — ученик увидит стандартный текст после регистрации.
                </p>
              )}
            </TabsContent>

            <TabsContent value="pricing" className="space-y-6 pt-4">
              <div className="space-y-3">
                <p className="text-sm font-medium">Услуги и базовые цены</p>
                <TrainerServicesSection enabled={open} />
              </div>
              <div className="border-t pt-4">
                <TrainerPricingSettings enabled={open} />
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0 min-w-0">
          {(onToggleBlockDay || onOpenBlockPeriod || onOpenBroadcast) && (
            <div className="flex flex-col gap-2 w-full min-w-0">
              {onToggleBlockDay && dayBlockedState ? (
                <Button
                  type="button"
                  variant={dayBlockedState.allBlocked ? "secondary" : "outline"}
                  className="w-full justify-start h-auto min-h-10 py-2 text-left whitespace-normal"
                  disabled={blockDayPending}
                  onClick={onToggleBlockDay}
                  data-testid="button-settings-block-day"
                >
                  {blockDayPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin flex-shrink-0" />
                  ) : dayBlockedState.allBlocked ? (
                    <Unlock className="h-4 w-4 mr-2 flex-shrink-0" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2 flex-shrink-0" />
                  )}
                  <span className="min-w-0">
                    {dayBlockedState.allBlocked ? "Открыть день" : "Закрыть день"}
                    <span className="ml-1 text-gray-500 font-normal">
                      ({format(new Date(dayBlockedState.dateStr + "T12:00:00"), "d MMMM yyyy", { locale: ru })})
                    </span>
                  </span>
                </Button>
              ) : onToggleBlockDay ? (
                <p className="text-xs text-gray-500 px-1">
                  Закрытие одного дня доступно в виде «День» — выберите дату в расписании и откройте настройки снова.
                </p>
              ) : null}
              <div className="flex flex-col gap-2 w-full min-w-0">
              {onOpenBlockPeriod && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start h-auto min-h-10 py-2 text-left whitespace-normal"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenBlockPeriod();
                  }}
                  data-testid="button-settings-block-period"
                >
                  <CalendarOff className="h-4 w-4 mr-2 flex-shrink-0" />
                  Отпуск / закрыть период
                </Button>
              )}
              {onOpenBroadcast && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start h-auto min-h-10 py-2 text-left whitespace-normal"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenBroadcast();
                  }}
                  data-testid="button-settings-broadcast"
                >
                  <Send className="h-4 w-4 mr-2 flex-shrink-0" />
                  Рассылка ученикам
                </Button>
              )}
              </div>
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
