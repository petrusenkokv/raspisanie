import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Props = ButtonProps & {
  membershipBlocked: boolean;
  membershipMessage: string;
};

export function MembershipBlockedButton({
  membershipBlocked,
  membershipMessage,
  disabled,
  title,
  children,
  className,
  onClick,
  ...buttonProps
}: Props) {
  const { toast } = useToast();
  const buttonTitle =
    membershipBlocked && membershipMessage ? membershipMessage : title;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (membershipBlocked) {
      e.preventDefault();
      e.stopPropagation();
      toast({
        variant: "destructive",
        description: membershipMessage,
      });
      return;
    }
    onClick?.(e);
  };

  const button = (
    <Button
      {...buttonProps}
      className={cn(className, membershipBlocked && "opacity-50 cursor-not-allowed")}
      disabled={Boolean(disabled) && !membershipBlocked}
      aria-disabled={membershipBlocked || disabled}
      title={buttonTitle}
      onClick={handleClick}
    >
      {children}
    </Button>
  );

  if (!membershipBlocked) {
    return button;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="inline-flex sm:flex sm:flex-1 sm:w-full sm:min-w-0">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs z-[100]">
        {membershipMessage}
      </TooltipContent>
    </Tooltip>
  );
}
