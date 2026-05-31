import { CalendarPlus, CircleSlash, Lock, UserCheck, Users } from "lucide-react";
import {
  type MonthDayFillLevel,
  monthDayGuestHint,
  monthDayStudentHint,
} from "@/lib/slot-availability-ui";
import { cn } from "@/lib/utils";

export type CalendarCellHintLevel =
  | MonthDayFillLevel
  | "blocked"
  | "guest-empty"
  | "guest-full";

const ICON_CLASS = "h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0";
const WEEK_ICON_CLASS = "h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0";

function HintIcon({
  fillLevel,
  compact = false,
}: {
  fillLevel: CalendarCellHintLevel;
  compact?: boolean;
}) {
  const cls = compact ? WEEK_ICON_CLASS : ICON_CLASS;
  switch (fillLevel) {
    case "blocked":
      return <Lock className={cn(cls, "text-gray-500 dark:text-gray-400")} />;
    case "booked":
      return <UserCheck className={cn(cls, "text-blue-600 dark:text-blue-400")} />;
    case "empty":
    case "guest-empty":
      return <UserCheck className={cn(cls, "text-green-600 dark:text-green-400")} />;
    case "partial":
      return <Users className={cn(cls, "text-amber-700 dark:text-amber-400")} />;
    case "full":
    case "guest-full":
      return <CircleSlash className={cn(cls, "text-red-500 dark:text-red-400")} />;
    default:
      return <CalendarPlus className={cn(cls, "text-green-600 dark:text-green-400")} />;
  }
}

function getHint(fillLevel: CalendarCellHintLevel) {
  if (fillLevel === "blocked") {
    return {
      shortLabel: "Закрыто",
      labelClass: "text-gray-600 dark:text-gray-400",
    };
  }
  const isGuest = fillLevel === "guest-empty" || fillLevel === "guest-full";
  const hint = isGuest
    ? monthDayGuestHint(fillLevel)
    : monthDayStudentHint(fillLevel as MonthDayFillLevel);
  return { shortLabel: hint.shortLabel, labelClass: hint.labelClass };
}

type CalendarCellHintProps = {
  fillLevel: CalendarCellHintLevel;
  layout: "month" | "week";
};

export function CalendarCellHint({ fillLevel, layout }: CalendarCellHintProps) {
  const hint = getHint(fillLevel);
  const showLabel =
    fillLevel !== "full" && fillLevel !== "guest-full";

  if (layout === "week") {
    return (
      <span className="flex items-center justify-center gap-0.5 min-w-0 px-0.5 pointer-events-none">
        <HintIcon fillLevel={fillLevel} compact />
        {showLabel && (
          <span
            className={cn(
              "hidden lg:inline text-[9px] font-medium leading-none truncate",
              hint.labelClass,
            )}
          >
            {hint.shortLabel}
          </span>
        )}
      </span>
    );
  }

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
