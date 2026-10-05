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
import { AlertTriangle } from "lucide-react";

interface IndividualTrainingWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
}

export function IndividualTrainingWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: IndividualTrainingWarningDialogProps) {
  const [confirmed, setConfirmed] = useState(false);

  const handleCancel = () => {
    setConfirmed(false);
    onOpenChange(false);
  };

  const handleConfirmClick = () => {
    setConfirmed(true);
  };

  const handleConfirmed = () => {
    onConfirm();
    setConfirmed(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleCancel}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            Внимание
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                Это время занято «индивидуальной тренировкой»
              </p>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Ученик уже записан на индивидуальную тренировку в это время. Вы точно хотите добавить ещё одного ученика?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          {!confirmed ? (
            <AlertDialogAction
              onClick={handleConfirmClick}
              disabled={pending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Всё равно записать
            </AlertDialogAction>
          ) : (
            <AlertDialogAction
              onClick={handleConfirmed}
              disabled={pending}
              className="bg-green-600 hover:bg-green-700 text-white animate-pulse"
            >
              Подтверждаю — записать
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
