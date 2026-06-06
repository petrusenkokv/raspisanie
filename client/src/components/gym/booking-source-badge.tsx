import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BOOKING_SOURCE_HINTS,
  BOOKING_SOURCE_LABELS,
  type BookingSource,
} from "@shared/booking-source";
import { cn } from "@/lib/utils";

const SOURCE_STYLES: Record<BookingSource, string> = {
  recurring:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  trainer:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  student_self:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  parent:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
};

type BookingSourceBadgeProps = {
  source: BookingSource;
  className?: string;
};

export const BookingSourceBadge = ({ source, className }: BookingSourceBadgeProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Badge
        variant="outline"
        className={cn("text-[10px] px-1.5 py-0 h-4 font-normal shrink-0", SOURCE_STYLES[source], className)}
      >
        {BOOKING_SOURCE_LABELS[source]}
      </Badge>
    </TooltipTrigger>
    <TooltipContent side="top" className="text-xs max-w-[220px]">
      {BOOKING_SOURCE_HINTS[source]}
    </TooltipContent>
  </Tooltip>
);
