import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Этапы доступа ученика:
 * 1. pendingApproval — ожидает одобрения тренера
 * 2. approvedNotAttended — одобрен, но не посещал ознакомительную тренировку
 * 3. attended — прошёл ознакомительную тренировку, полный доступ
 */
export type StudentAccessStage = "pendingApproval" | "approvedNotAttended" | "attended";

interface PendingApprovalBannerProps {
  /** Текущий этап доступа ученика */
  stage: StudentAccessStage;
  /** true = ученик выбрал «Ознакомительная тренировка» */
  wantsIntroductoryTraining?: boolean;
}

export function PendingApprovalBanner({ stage, wantsIntroductoryTraining }: PendingApprovalBannerProps) {
  if (stage === "attended") return null;

  if (stage === "pendingApproval") {
    return (
      <Alert variant="destructive" className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">Ожидает одобрения тренера</AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
          Вы зарегистрированы, ждите одобрения тренера. После одобрения сможете записаться на ознакомительную тренировку и оплатить посещение зала. Тренеру оплаты нет — бесплатно.
        </AlertDescription>
      </Alert>
    );
  }

  // approvedNotAttended
  return (
    <Alert className="mb-4 border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
      <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <AlertTitle className="text-blue-800 dark:text-blue-300">Ознакомительная тренировка</AlertTitle>
      <AlertDescription className="text-blue-700 dark:text-blue-400 text-sm">
        {wantsIntroductoryTraining
          ? "Вы можете записаться только на свободное время. Оплата — 300₽ по QR-коду в профиле."
          : "Регистрация одобрена. Для записи и оплаты обратитесь к тренеру."
        }
      </AlertDescription>
    </Alert>
  );
}
