import { Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ConfirmedBookingHintProps = {
  label?: string;
  iconClassName?: string;
  className?: string;
};

export const ConfirmedBookingHint = ({
  label = "Запись подтверждена",
  iconClassName = "h-3.5 w-3.5",
  className,
}: ConfirmedBookingHintProps) => (
  <Tooltip delayDuration={0}>
    <TooltipTrigger asChild>
      <span
        className={cn("inline-flex shrink-0 cursor-help text-green-600 dark:text-green-400", className)}
        tabIndex={0}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Check className={cn(iconClassName)} aria-hidden />
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" className="z-[100]">
      {label}
    </TooltipContent>
  </Tooltip>
);
