import { useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { Bell, BellOff, Check, CheckCheck, Trash2, X, UserCheck, Loader2 } from "lucide-react";
import type { PushStatus } from "@/hooks/use-push-notifications";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Notification } from "@shared/schema";

interface Props {
  userId: string;
  isTrainer: boolean;
  pushStatus?: PushStatus;
  pushLoading?: boolean;
  onPushSubscribe?: () => void;
  onPushUnsubscribe?: () => void;
}

function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tones = [880, 1320];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.15;
      const stop = start + 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, stop);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(stop + 0.05);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

function showBrowserNotification(title: string, body: string, tag = "gym-app") {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission !== "granted") return;
    new window.Notification(title, { body, tag });
  } catch {
    /* ignore */
  }
}

const TYPE_DOT: Record<string, string> = {
  booking_request: "bg-blue-500",
  booking_confirmed: "bg-green-500",
  booking_cancelled: "bg-red-500",
  training_reminder: "bg-amber-500",
  birthday_reminder: "bg-pink-500",
  broadcast: "bg-purple-500",
  profile_updated: "bg-teal-500",
  new_student: "bg-violet-500",
  registration_approved: "bg-green-500",
};

function formatTime(value: Date | string | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ч назад`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} дн назад`;
  return d.toLocaleDateString("ru-RU");
}

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

type Group = "today" | "yesterday" | "earlier";

const GROUP_LABEL: Record<Group, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  earlier: "Раньше",
};

function groupOf(value: Date | string | null): Group {
  if (!value) return "earlier";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "earlier";
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  const diffDays = Math.round((today - day) / 86400000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "earlier";
}

export function NotificationsPopover({
  userId,
  isTrainer,
  pushStatus,
  pushLoading,
  onPushSubscribe,
  onPushUnsubscribe,
}: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  useWebSocket();
  const seenIdsRef = useRef<Set<string> | null>(null);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  const markProcessed = (id: string) =>
    setProcessedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", userId],
    enabled: !!userId,
  });

  // Ask for browser-notifications permission once (trainer + students)
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission === "default") {
      window.Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Detect new alerts since last poll → chime + browser notification + toast
  useEffect(() => {
    // First load: prime the seen set without firing alerts
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(notifications.map((n) => n.id));
      return;
    }

    const seen = seenIdsRef.current;
    const alertTypes = isTrainer
      ? new Set(["booking_request", "booking_cancelled", "birthday_reminder"])
      : new Set(["training_reminder", "booking_confirmed", "booking_cancelled", "broadcast"]);

    const fresh = notifications.filter(
      (n) => !seen.has(n.id) && alertTypes.has(n.type) && !n.isRead
    );

    notifications.forEach((n) => seen.add(n.id));

    if (fresh.length > 0) {
      playChime();
      const first = fresh[0];
      const body =
        fresh.length === 1
          ? first.message
          : `${first.message} (и ещё ${fresh.length - 1})`;
      showBrowserNotification(first.title, body, `gym-${first.type}`);
      toast({ title: first.title, description: body });
    }
  }, [notifications, isTrainer, toast]);

  const sorted = useMemo(
    () =>
      [...notifications].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime()
      ),
    [notifications]
  );
  const unreadCount = sorted.filter((n) => !n.isRead).length;
  const readCount = sorted.length - unreadCount;

  const groups = useMemo(() => {
    const map: Record<Group, Notification[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    sorted.forEach((n) => map[groupOf(n.createdAt)].push(n));
    return (["today", "yesterday", "earlier"] as Group[])
      .map((g) => ({ key: g, label: GROUP_LABEL[g], items: map[g] }))
      .filter((g) => g.items.length > 0);
  }, [sorted]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
  };

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/notifications/${id}/read`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "PUT",
        `/api/notifications/user/${userId}/read-all`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
    },
  });

  const clearReadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "DELETE",
        `/api/notifications/user/${userId}/read`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
    },
  });

  const confirmBookingMutation = useMutation({
    mutationFn: async (vars: { bookingId: string; notificationId: string }) => {
      const res = await apiRequest(
        "PUT",
        `/api/bookings/${vars.bookingId}/confirm`
      );
      const data = await res.json();
      await apiRequest("PUT", `/api/notifications/${vars.notificationId}/read`);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Запись подтверждена" });
      invalidateAll();
    },
    onError: (e: any) =>
      toast({
        title: "Ошибка",
        description: e?.message,
        variant: "destructive",
      }),
  });

  const cancelBookingMutation = useMutation({
    mutationFn: async (vars: { bookingId: string; notificationId: string }) => {
      const res = await apiRequest(
        "PUT",
        `/api/bookings/${vars.bookingId}/cancel`,
        { cancelledBy: userId }
      );
      const data = await res.json();
      await apiRequest("PUT", `/api/notifications/${vars.notificationId}/read`);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Запись отменена" });
      invalidateAll();
    },
    onError: (e: any) =>
      toast({
        title: "Ошибка",
        description: e?.message,
        variant: "destructive",
      }),
  });

  const approveStudentMutation = useMutation({
    mutationFn: async (vars: { studentId: string; notificationId: string }) => {
      const res = await apiRequest("PATCH", `/api/trainer/students/${vars.studentId}/approve`);
      const data = await res.json();
      await apiRequest("PUT", `/api/notifications/${vars.notificationId}/read`);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Ученик одобрен" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
    },
    onError: (e: any) =>
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const isActing =
    confirmBookingMutation.isPending || cancelBookingMutation.isPending || approveStudentMutation.isPending;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative flex-shrink-0"
          data-testid="button-notifications"
          aria-label="Уведомления"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="bottom"
        collisionPadding={16}
        className="w-[calc(100vw-2rem)] max-w-sm sm:w-80 p-0 z-[100]"
        data-testid="popover-notifications"
      >
        <div className="flex flex-col gap-2 px-4 py-3 border-b">
          <div className="font-semibold text-base shrink-0">Уведомления</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50 whitespace-nowrap shrink-0"
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 shrink-0" />
                Прочитать все
              </button>
            )}
            {readCount > 0 && (
              <button
                type="button"
                onClick={() => clearReadMutation.mutate()}
                disabled={clearReadMutation.isPending}
                className="text-xs text-gray-500 hover:text-red-600 hover:underline flex items-center gap-1 disabled:opacity-50 whitespace-nowrap shrink-0"
                data-testid="button-clear-read"
                title="Удалить все прочитанные"
              >
                <Trash2 className="h-3 w-3 shrink-0" />
                Очистить
              </button>
            )}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Уведомлений пока нет
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto overscroll-contain">
            {groups.map((group) => (
              <div key={group.key} data-testid={`group-${group.key}`}>
                <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/80 backdrop-blur px-4 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 border-b">
                  {group.label}
                </div>
                <ul className="divide-y">
                  {group.items.map((n) => {
                    const showActions =
                      isTrainer &&
                      n.type === "booking_request" &&
                      !!n.relatedBookingId &&
                      !n.isRead &&
                      !processedIds.has(n.id);

                    const showApprove =
                      isTrainer &&
                      n.type === "new_student" &&
                      !!n.relatedUserId &&
                      !n.isRead &&
                      !processedIds.has(n.id);
                    return (
                      <li
                        key={n.id}
                        className={cn(
                          "px-4 py-3 flex gap-3 items-start",
                          !n.isRead && "bg-blue-50/60 dark:bg-blue-950/30"
                        )}
                        data-testid={`notification-${n.id}`}
                      >
                        <span
                          className={cn(
                            "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                            TYPE_DOT[n.type] ?? "bg-gray-400"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {n.title}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 break-words">
                            {n.message}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {formatTime(n.createdAt)}
                          </div>

                          {showActions && (
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={isActing}
                                onClick={() => {
                                  markProcessed(n.id);
                                  confirmBookingMutation.mutate({
                                    bookingId: n.relatedBookingId!,
                                    notificationId: n.id,
                                  });
                                }}
                                data-testid={`button-confirm-${n.id}`}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Подтвердить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={isActing}
                                onClick={() => {
                                  markProcessed(n.id);
                                  cancelBookingMutation.mutate({
                                    bookingId: n.relatedBookingId!,
                                    notificationId: n.id,
                                  });
                                }}
                                data-testid={`button-cancel-${n.id}`}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Отменить
                              </Button>
                            </div>
                          )}

                          {showApprove && (
                            <div className="mt-2">
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                                disabled={isActing}
                                onClick={() => {
                                  markProcessed(n.id);
                                  approveStudentMutation.mutate({
                                    studentId: n.relatedUserId!,
                                    notificationId: n.id,
                                  });
                                }}
                                data-testid={`button-approve-student-${n.id}`}
                              >
                                <UserCheck className="h-3 w-3 mr-1" />
                                Одобрить регистрацию
                              </Button>
                            </div>
                          )}
                        </div>

                        {!n.isRead && !showActions && !showApprove && (
                          <button
                            type="button"
                            onClick={() => markReadMutation.mutate(n.id)}
                            disabled={markReadMutation.isPending}
                            className="text-gray-400 hover:text-blue-600 flex-shrink-0 mt-1"
                            title="Отметить прочитанным"
                            data-testid={`button-mark-read-${n.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {pushStatus && pushStatus !== "unsupported" && onPushSubscribe && onPushUnsubscribe && (
          <div className="border-t px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Уведомления в браузере
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-8"
              disabled={pushLoading}
              onClick={pushStatus === "granted" ? onPushUnsubscribe : onPushSubscribe}
            >
              {pushLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : pushStatus === "granted" ? (
                <Bell className="h-4 w-4 mr-2 text-blue-600" />
              ) : (
                <BellOff className="h-4 w-4 mr-2" />
              )}
              {pushStatus === "granted" ? "Отключить push" : "Включить push"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
