import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus, CalendarOff, Clock } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { type WeeklyTemplate, type WeekdayTemplateEntry, type Holiday } from "@shared/schema";

interface ScheduleSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  holidays: Holiday[];
};

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ScheduleSettingsDialog({ open, onOpenChange }: ScheduleSettingsDialogProps) {
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройки расписания</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <Tabs defaultValue="hours" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="hours" data-testid="tab-hours">
                <Clock className="h-4 w-4 mr-1" />
                Часы
              </TabsTrigger>
              <TabsTrigger value="week" data-testid="tab-week">
                Неделя
              </TabsTrigger>
              <TabsTrigger value="limits" data-testid="tab-limits">
                Ограничения
              </TabsTrigger>
              <TabsTrigger value="holidays" data-testid="tab-holidays">
                <CalendarOff className="h-4 w-4 mr-1" />
                Праздники
              </TabsTrigger>
            </TabsList>

            {/* Working hours tab */}
            <TabsContent value="hours" className="space-y-4 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Диапазон часов, который виден в расписании. Внутри этого диапазона
                для каждого дня недели можно задать свой график (вкладка «Неделя»).
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Начало дня</Label>
                  <select
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-900"
                    value={dayStart}
                    onChange={(e) => setDayStart(Number(e.target.value))}
                    data-testid="select-day-start"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Конец дня</Label>
                  <select
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-900"
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
                      className="border rounded p-3 space-y-2"
                      data-testid={`row-weekday-${k}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-32 text-sm font-medium">{WEEKDAY_LABELS[k]}</div>
                        <Switch
                          checked={entry.enabled}
                          onCheckedChange={(checked) => updateDayEntry(k, { enabled: checked })}
                          data-testid={`switch-weekday-${k}`}
                        />
                        {entry.enabled ? (
                          <div className="flex items-center gap-2 ml-auto">
                            <select
                              className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900"
                              value={entry.startHour}
                              onChange={(e) => updateDayEntry(k, { startHour: Number(e.target.value) })}
                              data-testid={`select-start-${k}`}
                            >
                              {Array.from({ length: 24 }).map((_, h) => (
                                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                              ))}
                            </select>
                            <span className="text-sm">—</span>
                            <select
                              className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900"
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
                        ) : (
                          <span className="ml-auto text-sm text-gray-500">Выходной</span>
                        )}
                      </div>

                      {entry.enabled && (
                        <div className="flex items-center gap-3 pl-32">
                          <span className="text-xs text-gray-600 dark:text-gray-400">Перерыв</span>
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
                          {breakOn ? (
                            <div className="flex items-center gap-2 ml-auto">
                              <select
                                className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900"
                                value={breakStart}
                                onChange={(e) => updateDayEntry(k, { breakStartHour: Number(e.target.value) })}
                                data-testid={`select-break-start-${k}`}
                              >
                                {Array.from({ length: entry.endHour - entry.startHour }).map((_, i) => {
                                  const h = entry.startHour + i;
                                  return <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>;
                                })}
                              </select>
                              <span className="text-sm">—</span>
                              <select
                                className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900"
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
                            <span className="ml-auto text-xs text-gray-500">Без перерыва</span>
                          )}
                        </div>
                      )}

                      {entry.enabled && (
                        <div className="flex items-center gap-3 pl-32">
                          <span className="text-xs text-gray-600 dark:text-gray-400">Мест в час</span>
                          <Switch
                            checked={capOverride}
                            onCheckedChange={(checked) =>
                              updateDayEntry(k, { capacity: checked ? defaultCapacity : null })
                            }
                            data-testid={`switch-capacity-${k}`}
                          />
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
                              className="ml-auto w-24 h-8"
                              data-testid={`input-capacity-${k}`}
                            />
                          ) : (
                            <span className="ml-auto text-xs text-gray-500">
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
                  Применяется ко всем ученикам. Это дополнительное напоминание —
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Дата</Label>
                    <Input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      data-testid="input-holiday-date"
                    />
                  </div>
                  <div>
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
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
