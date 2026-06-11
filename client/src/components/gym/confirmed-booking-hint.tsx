import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmedBookingHintProps = {
  label?: string;
  iconClassName?: string;
  className?: string;
};

/** Confirmed booking indicator — icon only (no tooltip: tooltips stick open on mobile sheets). */
export const ConfirmedBookingHint = ({
  label = "Запись подтверждена",
  iconClassName = "h-3.5 w-3.5",
  className,
}: ConfirmedBookingHintProps) => (
  <span
    className={cn("inline-flex shrink-0 text-green-600 dark:text-green-400", className)}
    role="img"
    aria-label={label}
    onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => e.stopPropagation()}
  >
    <Check className={cn(iconClassName)} aria-hidden />
  </span>
);
