import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Этапы доступа ученика:
 * 1. pendingApproval — ожидает одобрения тренера
 * 2. attended — одобрен, полный доступ
 */
export type StudentAccessStage = "pendingApproval" | "attended";

interface PendingApprovalBannerProps {
  /** Текущий этап доступа ученика */
  stage: StudentAccessStage;
}

export function PendingApprovalBanner({ stage }: PendingApprovalBannerProps) {
  if (stage === "attended") return null;

  return (
    <Alert variant="destructive" className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-800 dark:text-amber-300">Ожидает одобрения тренера</AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
        Вы зарегистрированы, ждите одобрения тренера. После одобрения сможете работать с расписанием.
      </AlertDescription>
    </Alert>
  );
}
