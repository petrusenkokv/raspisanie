import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookingMessageField } from "./booking-message-field";

export type StudentCancelBookingTarget = {
  bookingId: string;
  personName?: string;
};

export function useStudentBookingCancel(
  onCancel: (bookingId: string, message?: string) => void,
) {
  const [target, setTarget] = useState<StudentCancelBookingTarget | null>(null);
  const [message, setMessage] = useState("");

  const requestCancel = (next: StudentCancelBookingTarget) => {
    setMessage("");
    setTarget(next);
  };

  const handleClose = () => {
    setTarget(null);
    setMessage("");
  };

  const handleConfirm = () => {
    if (!target) return;
    const trimmed = message.trim();
    onCancel(target.bookingId, trimmed || undefined);
    handleClose();
  };

  const dialog = (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отменить запись?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {target?.personName ? (
                <p className="font-medium text-foreground">{target.personName}</p>
              ) : null}
              <BookingMessageField
                id="student-cancel-message"
                value={message}
                onChange={setMessage}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Назад</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={handleConfirm}
          >
            Отменить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestCancel, dialog };
}
