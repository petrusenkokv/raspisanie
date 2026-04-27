import { Bell, Check, CheckCheck, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Notification } from "@shared/schema";

interface Props {
  userId: string;
  isTrainer: boolean;
}

const TYPE_DOT: Record<string, string> = {
  booking_request: "bg-blue-500",
  booking_confirmed: "bg-green-500",
  booking_cancelled: "bg-red-500",
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

export function NotificationsPopover({ userId, isTrainer }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", userId],
    refetchInterval: 15000,
  });

  const sorted = [...notifications].sort(
    (a, b) =>
      new Date(b.createdAt ?? 0).getTime() -
      new Date(a.createdAt ?? 0).getTime()
  );
  const unreadCount = sorted.filter((n) => !n.isRead).length;

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
        `/api/bookings/${vars.bookingId}/cancel`
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

  const isActing =
    confirmBookingMutation.isPending || cancelBookingMutation.isPending;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative"
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
        align="end"
        className="w-80 p-0"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-sm">Уведомления</div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3 w-3" />
              Прочитать все
            </button>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Уведомлений пока нет
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y">
              {sorted.map((n) => {
                const showActions =
                  isTrainer &&
                  n.type === "booking_request" &&
                  !!n.relatedBookingId;
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
                            onClick={() =>
                              confirmBookingMutation.mutate({
                                bookingId: n.relatedBookingId!,
                                notificationId: n.id,
                              })
                            }
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
                            onClick={() =>
                              cancelBookingMutation.mutate({
                                bookingId: n.relatedBookingId!,
                                notificationId: n.id,
                              })
                            }
                            data-testid={`button-cancel-${n.id}`}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Отменить
                          </Button>
                        </div>
                      )}
                    </div>

                    {!n.isRead && !showActions && (
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
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
