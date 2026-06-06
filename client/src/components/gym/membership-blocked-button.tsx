import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  ...buttonProps
}: Props) {
  const isDisabled = Boolean(disabled) || membershipBlocked;
  const buttonTitle =
    membershipBlocked && membershipMessage ? membershipMessage : title;

  const button = (
    <Button {...buttonProps} className={className} disabled={isDisabled} title={buttonTitle}>
      {children}
    </Button>
  );

  if (!membershipBlocked) {
    return button;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="flex flex-1 w-full min-w-0">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs z-[100]">
        {membershipMessage}
      </TooltipContent>
    </Tooltip>
  );
}
