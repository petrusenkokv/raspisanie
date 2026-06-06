import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useGymStore } from "@/store/gym-store";
import type { TimeSlotWithBookings } from "@shared/schema";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DaySlotRow } from "./day-slot-row";

type SlotGroupKey = "booked" | "available" | "closed";

type Props = {
  timeSlots: TimeSlotWithBookings[];
  familyStudentIds?: string[];
  onBook: (timeSlotId: string) => void;
  onCancel: (bookingId: string, message?: string) => void;
  onConfirm: (bookingId: string) => void;
  onLoginRequest: (mode?: "login" | "register") => void;
  onTrainerBook?: (timeSlotId: string) => void;
};

function slotTimeLabel(time: string) {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function minutesUntilSlotMoscow(date: string, time: string): number {
  const t = slotTimeLabel(time);
  const ms = new Date(`${date}T${t}:00+03:00`).getTime();
  if (isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Math.round((ms - Date.now()) / 60_000);
}

function formatTimeSummary(slots: TimeSlotWithBookings[], suffix?: string) {
  if (slots.length === 0) return "";
  const times = slots.map((s) => slotTimeLabel(s.time)).join(", ");
  return suffix ? `${times} — ${suffix}` : times;
}

function classifySlot(
  timeSlot: TimeSlotWithBookings,
  opts: {
    isTrainer: boolean;
    isGuest: boolean;
    familyStudentIds: string[];
    currentUserId?: string;
    bookingDeadlineH: number;
  },
): SlotGroupKey {
  const { isTrainer, isGuest, familyStudentIds, currentUserId, bookingDeadlineH } = opts;
  const isBlocked = timeSlot.isBlocked;
  const isFull = timeSlot.availableSpots === 0;
  const minutesUntil = minutesUntilSlotMoscow(timeSlot.date, timeSlot.time);
  const tooLateToBook =
    !isTrainer && bookingDeadlineH > 0 && minutesUntil <= bookingDeadlineH * 60;

  const activeBookings = timeSlot.bookings.filter((b) => b.status !== "cancelled");

  if (isTrainer) {
    if (isBlocked || isFull) return "closed";
    if (activeBookings.length > 0) return "booked";
    return "available";
  }

  const bookingStudentIds =
    familyStudentIds.length > 0
      ? familyStudentIds
      : currentUserId
        ? [currentUserId]
        : [];
  const familyBookings = timeSlot.bookings.filter(
    (b) => b.status !== "cancelled" && bookingStudentIds.includes(b.studentId),
  );

  if (!isGuest && familyBookings.length > 0) return "booked";
  if (isBlocked || isFull || tooLateToBook) return "closed";
  return "available";
}

export function DaySlotGroups({
  timeSlots,
  familyStudentIds = [],
  onBook,
  onCancel,
  onConfirm,
  onLoginRequest,
  onTrainerBook,
}: Props) {
  const { currentUser, isTrainer } = useGymStore();
  const viewerIsTrainer = isTrainer();
  const isGuest = !currentUser && !viewerIsTrainer;

  const { data: scheduleSettings } = useQuery<{
    bookingDeadlineHours?: number;
  }>({
    queryKey: ["/api/schedule/settings"],
    staleTime: 60_000,
  });
  const bookingDeadlineH = scheduleSettings?.bookingDeadlineHours ?? 0;

  const grouped = useMemo(() => {
    const buckets: Record<SlotGroupKey, TimeSlotWithBookings[]> = {
      booked: [],
      available: [],
      closed: [],
    };

    for (const ts of timeSlots) {
      const key = classifySlot(ts, {
        isTrainer: viewerIsTrainer,
        isGuest,
        familyStudentIds,
        currentUserId: currentUser?.id,
        bookingDeadlineH,
      });
      buckets[key].push(ts);
    }

    return buckets;
  }, [timeSlots, viewerIsTrainer, isGuest, familyStudentIds, currentUser?.id, bookingDeadlineH]);

  const sections: {
    key: SlotGroupKey;
    title: string;
    defaultOpen: boolean;
    suffix?: string;
  }[] = viewerIsTrainer
    ? [
        { key: "booked", title: "С записью", defaultOpen: true },
        { key: "available", title: "Свободно", defaultOpen: false, suffix: "свободно" },
        { key: "closed", title: "Закрыто / не работает", defaultOpen: false },
      ]
    : [
        { key: "booked", title: "Мои записи", defaultOpen: true },
        { key: "available", title: "Доступно", defaultOpen: false, suffix: "записаться" },
        { key: "closed", title: "Закрыто / не работает", defaultOpen: false },
      ];

  const visibleSections = sections.filter(({ key }) => grouped[key].length > 0);

  return (
    <div className="space-y-2">
      {visibleSections.map(({ key, title, defaultOpen, suffix }) => {
        const slots = grouped[key];
        const summary = formatTimeSummary(slots, suffix);
        const countLabel = `${slots.length}`;

        return (
          <Collapsible key={key} defaultOpen={defaultOpen} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <CollapsibleTrigger
              className={cn(
                "group w-full flex items-start gap-2 px-2.5 py-2 text-left",
                "bg-gray-50/90 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800",
                "transition-colors",
              )}
              aria-label={`${title}, ${summary || countLabel}`}
              data-testid={`day-slot-group-${key}`}
            >
              <ChevronDown
                className="h-4 w-4 shrink-0 mt-0.5 text-gray-500 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{countLabel}</span>
                </span>
                <span className="block text-xs text-gray-600 dark:text-gray-300 leading-snug mt-0.5 group-data-[state=open]:hidden">
                  {summary}
                </span>
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-1 p-1.5 pt-0 border-t border-gray-200/80 dark:border-gray-700/80">
                {slots.map((ts) => (
                  <DaySlotRow
                    key={ts.id}
                    timeSlot={ts}
                    familyStudentIds={familyStudentIds}
                    onBook={onBook}
                    onCancel={onCancel}
                    onConfirm={onConfirm}
                    onLoginRequest={onLoginRequest}
                    onTrainerBook={onTrainerBook}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
