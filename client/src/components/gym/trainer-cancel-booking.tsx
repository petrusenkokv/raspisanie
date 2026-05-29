import { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
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

export type TrainerCancelBookingTarget = {
  bookingId: string;
  studentName: string;
  slotDate: string;
  slotTime: string;
  isPast: boolean;
  isRecurring?: boolean;
};

export function useTrainerBookingCancel(onCancel: (bookingId: string) => void) {
  const [target, setTarget] = useState<TrainerCancelBookingTarget | null>(null);

  const requestCancel = (next: TrainerCancelBookingTarget) => {
    if (next.isPast || next.isRecurring) {
      setTarget(next);
      return;
    }
    onCancel(next.bookingId);
  };

  const dialog = (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target?.isPast ? "Удалить прошедшую запись?" : "Отменить запись?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{target?.studentName}</span>
                {" — "}
                {target?.slotTime}
                {", "}
                {target?.slotDate
                  ? format(new Date(`${target.slotDate}T00:00:00`), "d MMMM yyyy", { locale: ru })
                  : ""}
              </p>
              {target?.isPast ? (
                <p>
                  Тренировка уже прошла. Запись будет удалена из расписания (отменена).
                  Проверьте, что выбрали правильного ученика и время — отменить действие будет нельзя.
                </p>
              ) : target?.isRecurring ? (
                <p>
                  Это занятие из повторяющегося правила. Будет отменено только на эту дату — правило
                  продолжит работать на другие дни. При необходимости дату можно вернуть в блоке
                  «Повторяющиеся записи».
                </p>
              ) : (
                <p>Запись будет отменена.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Оставить запись</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              if (target) onCancel(target.bookingId);
              setTarget(null);
            }}
          >
            Да, удалить запись
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestCancel, dialog };
}
