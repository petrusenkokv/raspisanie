import { CalendarPlus, CircleSlash, UserCheck, Users } from "lucide-react";
import type { TimeSlotWithBookings } from "@shared/schema";
import {
  type MonthDayFillLevel,
  monthDayGuestHint,
  monthDayStudentHint,
} from "@/lib/slot-availability-ui";
import { cn } from "@/lib/utils";

type MonthDayCellHintProps = {
  openSlots: TimeSlotWithBookings[];
  fillLevel: MonthDayFillLevel | "guest-empty" | "guest-full";
  familyStudentIds: string[];
};

const ICON_CLASS = "h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0";

function HintIcon({ fillLevel }: { fillLevel: MonthDayFillLevel | "guest-empty" | "guest-full" }) {
  switch (fillLevel) {
    case "booked":
      return <UserCheck className={cn(ICON_CLASS, "text-blue-600 dark:text-blue-400")} />;
    case "empty":
    case "guest-empty":
      return <UserCheck className={cn(ICON_CLASS, "text-green-600 dark:text-green-400")} />;
    case "partial":
      return <Users className={cn(ICON_CLASS, "text-amber-700 dark:text-amber-400")} />;
    case "full":
    case "guest-full":
      return <CircleSlash className={cn(ICON_CLASS, "text-red-500 dark:text-red-400")} />;
    default:
      return <CalendarPlus className={cn(ICON_CLASS, "text-green-600 dark:text-green-400")} />;
  }
}

export function MonthDayCellHint({
  fillLevel,
}: MonthDayCellHintProps) {
  const isGuest = fillLevel === "guest-empty" || fillLevel === "guest-full";
  const hint = isGuest
    ? monthDayGuestHint(fillLevel)
    : monthDayStudentHint(fillLevel as MonthDayFillLevel);

  const showLabel = fillLevel !== "full" && fillLevel !== "guest-full";

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-0 w-full px-0.5 pb-0.5 pointer-events-none">
      <HintIcon fillLevel={fillLevel} />
      {showLabel && (
        <span
          className={cn(
            "hidden lg:block text-[10px] font-medium leading-tight text-center truncate max-w-full px-0.5",
            hint.labelClass,
          )}
        >
          {hint.shortLabel}
        </span>
      )}
    </div>
  );
}
