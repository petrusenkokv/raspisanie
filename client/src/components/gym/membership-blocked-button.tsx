import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MembershipBlockHint } from "./membership-block-hint";

type Props = ButtonProps & {
  membershipBlocked: boolean;
  membershipMessage: string;
  hintMessage?: string;
};

export function MembershipBlockedButton({
  membershipBlocked,
  membershipMessage,
  hintMessage,
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
  const visibleHint = hintMessage ?? membershipMessage;

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
    <div className="flex flex-col gap-1.5 flex-1 w-full min-w-0">
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className="flex flex-1 w-full min-w-0">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs z-[100]">
          {membershipMessage}
        </TooltipContent>
      </Tooltip>
      <MembershipBlockHint message={visibleHint} />
    </div>
  );
}
