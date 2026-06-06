import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  ...buttonProps
}: Props) {
  const isDisabled = Boolean(disabled) || membershipBlocked;
  const buttonTitle =
    membershipBlocked && membershipMessage ? membershipMessage : title;
  const visibleHint = hintMessage ?? membershipMessage;

  const button = (
    <Button {...buttonProps} className={className} disabled={isDisabled} title={buttonTitle}>
      {children}
    </Button>
  );

  const wrappedButton = membershipBlocked ? (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="flex flex-1 w-full min-w-0">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs z-[100]">
        {membershipMessage}
      </TooltipContent>
    </Tooltip>
  ) : (
    button
  );

  if (!membershipBlocked) {
    return wrappedButton;
  }

  return (
    <div className="flex flex-col gap-1.5 flex-1 w-full min-w-0">
      {wrappedButton}
      <MembershipBlockHint message={visibleHint} />
    </div>
  );
}
