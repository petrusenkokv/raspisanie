import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Trash2, X, UserCheck, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";
import { isRealtimeDisabled } from "@/hooks/use-websocket";
import { cn } from "@/lib/utils";
import type { Notification, User } from "@shared/schema";

interface Props {
  userId: string;
  isTrainer: boolean;
}

const TYPE_DOT: Record<string, string> = {
  booking_request: "bg-blue-500",
  booking_confirmed: "bg-green-500",
  booking_cancelled: "bg-red-500",
  training_reminder: "bg-amber-500",
  trainer_training_reminder: "bg-amber-500",
  birthday_reminder: "bg-pink-500",
  broadcast: "bg-purple-500",
  profile_updated: "bg-teal-500",
  new_student: "bg-violet-500",
  registration_approved: "bg-green-500",
  consent_revoked: "bg-orange-500",
  recurring_conflict: "bg-red-500",
};

// Типы напоминаний, которые удалены (тренеру и ученикам).
// Старые записи таких типов прячем из списка и не показываем по ним алерты.
const REMINDER_TYPES = new Set([
  "training_reminder",
  "trainer_training_reminder",
  "cv_expiry_reminder",
  "trainer_subscription_reminder",
  "birthday_reminder",
]);

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
}: Props) {
  const queryClient = useQueryClient();
  const seenIdsRef = useRef<Set<string> | null>(null);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  const markProcessed = (id: string) =>
    setProcessedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const [popoverOpen, setPopoverOpen] = useState(false);

  const { data: rawNotifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", userId],
    enabled: !!userId,
    staleTime: 0,
    refetchInterval: isRealtimeDisabled() ? (isTrainer ? 10_000 : 15_000) : false,
  });

  // Напоминания удалены — фильтруем их из всего, что видит пользователь.
  const notifications = useMemo(
    () => rawNotifications.filter((n) => !REMINDER_TYPES.has(n.type)),
    [rawNotifications],
  );

  const { data: students = [] } = useQuery<User[]>({
    queryKey: ["/api/trainer/students"],
    enabled: isTrainer && !!userId,
    staleTime: 30_000,
  });

  const pendingByStudentId = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const student of students) {
      map.set(student.id, student.isPendingApproval === true);
    }
    return map;
  }, [students]);

  // Detect new alerts when list updates → refetch schedule only (no toast/push)
  useEffect(() => {
    // First load: prime the seen set without firing alerts
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(notifications.map((n) => n.id));
      return;
    }

    const seen = seenIdsRef.current;
    const alertTypes = isTrainer
      ? new Set(["booking_request", "booking_cancelled", "consent_revoked", "recurring_conflict"])
      : new Set(["booking_confirmed", "booking_cancelled", "broadcast"]);

    const fresh = notifications.filter(
      (n) => !seen.has(n.id) && alertTypes.has(n.type) && !n.isRead
    );

    notifications.forEach((n) => seen.add(n.id));

    if (fresh.length > 0) {
      void queryClient.refetchQueries({ queryKey: ["schedule"] });
      void queryClient.refetchQueries({ queryKey: ["/api/schedule/day"] });
    }
  }, [notifications, isTrainer, queryClient]);

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
      invalidateAll();
    },
    onError: (e: any) =>
      console.error("confirm booking error", e),
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
      invalidateAll();
    },
    onError: (e: any) =>
      console.error("cancel booking error", e),
  });

  const approveStudentMutation = useMutation({
    mutationFn: async (vars: { studentId: string; notificationId: string }) => {
      const res = await apiRequest("PATCH", `/api/trainer/students/${vars.studentId}/approve`);
      const data = await res.json();
      await apiRequest("PUT", `/api/notifications/${vars.notificationId}/read`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
    },
    onError: (e: any) =>
      console.error("approve student error", e),
  });

  const isActing =
    confirmBookingMutation.isPending || cancelBookingMutation.isPending || approveStudentMutation.isPending;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
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
          <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1">
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

                    const showNewStudentNotice =
                      isTrainer &&
                      n.type === "new_student" &&
                      !!n.relatedUserId &&
                      !n.isRead &&
                      !processedIds.has(n.id);

                    const studentPendingKnown =
                      !!n.relatedUserId &&
                      students.length > 0 &&
                      pendingByStudentId.has(n.relatedUserId);

                    const studentStillPending =
                      studentPendingKnown && pendingByStudentId.get(n.relatedUserId!) === true;

                    const showApprove =
                      showNewStudentNotice &&
                      (!studentPendingKnown || studentStillPending);

                    const showAlreadyApproved =
                      showNewStudentNotice && studentPendingKnown && !studentStillPending;
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

                          {showAlreadyApproved && (
                            <div className="mt-2 space-y-2">
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                Регистрация уже одобрена (согласия с документами — отдельно). Закройте уведомление.
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={isActing}
                                onClick={() => {
                                  markProcessed(n.id);
                                  approveStudentMutation.mutate({
                                    studentId: n.relatedUserId!,
                                    notificationId: n.id,
                                  });
                                }}
                              >
                                Понятно
                              </Button>
                            </div>
                          )}
                        </div>

                        {!n.isRead && !showActions && !showApprove && !showAlreadyApproved && (
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

      </PopoverContent>
    </Popover>
  );
}
