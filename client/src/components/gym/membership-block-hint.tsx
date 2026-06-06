import { cn } from "@/lib/utils";

/** Показывать подсказку только на touch-устройствах (телефон, планшет без мыши). */
export const touchOnlyHintClass = "hidden [@media(hover:none)]:block";

type Props = {
  message: string;
  className?: string;
};

export function MembershipBlockHint({ message, className }: Props) {
  return (
    <p
      className={cn(
        "text-xs text-red-600 dark:text-red-400 leading-snug",
        touchOnlyHintClass,
        className,
      )}
      role="note"
    >
      {message}
    </p>
  );
}
