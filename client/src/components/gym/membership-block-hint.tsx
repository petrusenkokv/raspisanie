import { cn } from "@/lib/utils";

type Props = {
  message: string;
  className?: string;
};

export function MembershipBlockHint({ message, className }: Props) {
  return (
    <p
      className={cn(
        "text-xs text-red-600 dark:text-red-400 leading-snug",
        className,
      )}
      role="note"
    >
      {message}
    </p>
  );
}
