import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { User } from "@shared/schema";
import { MembershipBlockedButton } from "@/components/gym/membership-blocked-button";
import { useStudentPaymentStatus } from "@/components/gym/booking-payment-badges";
import { shouldShowMembershipBadge } from "@/lib/utils-gym";
import { MEMBERSHIP_BOOKING_BLOCK_MESSAGE } from "@shared/membership-booking";

interface ParentBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: User[];
  currentUser: User | null;
  isAlsoStudent: boolean;
  bookedStudentIds?: string[];
  slotDate?: string;
  loading?: boolean;
  onConfirm: (studentId: string) => void;
}

export function ParentBookDialog({
  open,
  onOpenChange,
  children,
  currentUser,
  isAlsoStudent,
  bookedStudentIds = [],
  slotDate = "",
  loading,
  onConfirm,
}: ParentBookDialogProps) {
  const [selectedId, setSelectedId] = useState("");
  const availableChildren = children.filter((child) => !bookedStudentIds.includes(child.id));
  const canBookSelf = !!(isAlsoStudent && currentUser?.id && !bookedStudentIds.includes(currentUser.id));

  useEffect(() => {
    if (!open) {
      setSelectedId("");
      return;
    }
    if (selectedId) return;
    if (canBookSelf && currentUser?.id) {
      setSelectedId(currentUser.id);
      return;
    }
    setSelectedId(availableChildren[0]?.id ?? "");
  }, [open, selectedId, canBookSelf, currentUser?.id, availableChildren.length]);

  const selectedStudent =
    selectedId === currentUser?.id
      ? currentUser
      : availableChildren.find((c) => c.id === selectedId) ??
        children.find((c) => c.id === selectedId) ??
        null;
  const showMembershipBadge =
    !!selectedStudent &&
    !!slotDate &&
    shouldShowMembershipBadge(selectedStudent);
  const { data: selectedPaymentStatus } = useStudentPaymentStatus(
    showMembershipBadge ? selectedId : undefined,
    slotDate,
    open && showMembershipBadge,
  );
  const blockedByMembership =
    showMembershipBadge &&
    selectedPaymentStatus !== undefined &&
    !selectedPaymentStatus.hasMembership;

  const handleConfirm = () => {
    if (!selectedId || blockedByMembership) return;
    onConfirm(selectedId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Запись на тренировку</DialogTitle>
          <DialogDescription>Выберите, кого записать на этот слот</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Ученик</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите ученика" />
              </SelectTrigger>
              <SelectContent>
                {canBookSelf && currentUser && (
                  <SelectItem value={currentUser.id}>
                    Себя ({currentUser.firstName} {currentUser.lastName ?? ""})
                  </SelectItem>
                )}
                {availableChildren.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.lastName} {child.firstName}
                    {(child as any).isPendingApproval ? " (ожидает одобрения)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!canBookSelf && availableChildren.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Все доступные ученики из семьи уже записаны в этот слот.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
              Отмена
            </Button>
            <MembershipBlockedButton
              className="flex-1"
              membershipBlocked={blockedByMembership}
              membershipMessage={MEMBERSHIP_BOOKING_BLOCK_MESSAGE}
              onClick={handleConfirm}
              disabled={loading || !selectedId}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Записать
            </MembershipBlockedButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
