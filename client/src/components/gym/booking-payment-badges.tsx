import { useQuery } from "@tanstack/react-query";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Wallet, Dumbbell } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import type { StudentPaymentStatus } from "@shared/schema";

export function useStudentPaymentStatus(
  studentId: string | undefined,
  dateStr: string,
  enabled = true,
) {
  const { isTrainer } = useGymStore();
  const paymentStatusUrl = isTrainer()
    ? `/api/trainer/students/${studentId}/payment-status?date=${encodeURIComponent(dateStr)}`
    : `/api/student/payment-status/${studentId}?date=${encodeURIComponent(dateStr)}`;

  return useQuery<StudentPaymentStatus>({
    queryKey: ["payment-status", studentId, dateStr, isTrainer() ? "trainer" : "student"],
    queryFn: async () => {
      const r = await apiRequest("GET", paymentStatusUrl);
      return r.json();
    },
    staleTime: 30_000,
    retry: 2,
    enabled: Boolean(studentId && dateStr && enabled),
  });
}

export function BookingPaymentBadges({
  studentId,
  dateStr,
  showMembership = true,
  showTrainerPayment = true,
}: {
  studentId: string;
  dateStr: string;
  showMembership?: boolean;
  showTrainerPayment?: boolean;
}) {
  const showAny = showMembership || showTrainerPayment;
  const { data, isLoading, isError } = useStudentPaymentStatus(
    studentId,
    dateStr,
    showAny,
  );

  if (!showAny) return null;

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0" aria-hidden>
        <span className="h-5 w-9 rounded border border-gray-200 bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <span className="h-5 w-9 rounded border border-gray-200 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </span>
    );
  }

  if (isError || !data) {
    return (
      <span
        className="inline-flex items-center gap-1 shrink-0 text-[10px] text-gray-500"
        title="Не удалось загрузить статус оплаты"
      >
        <span className="px-1 py-0.5 rounded border border-gray-300 bg-gray-50 dark:bg-gray-800">ЧВ ?</span>
        <span className="px-1 py-0.5 rounded border border-gray-300 bg-gray-50 dark:bg-gray-800">Тр ?</span>
      </span>
    );
  }

  const cvOk = data.hasMembership;
  const cvLabel = data.membershipKind === "monthly_cv" ? "ЧВ" : data.membershipKind === "one_time_bv" ? "БВ" : "ЧВ";
  const trainerOk = data.hasTrainerPayment;
  const trainerLabel = data.activeTrainerPayment
    ? `${Math.max(0, data.activeTrainerPayment.totalSessions - data.activeTrainerPayment.usedSessions)}/${data.activeTrainerPayment.totalSessions}`
    : "—";

  let cvTooltipNode: React.ReactNode;
  let cvDaysLeft: number | null = null;
  if (cvOk && data.membershipKind === "monthly_cv" && data.cvPaidDate && data.cvValidUntil) {
    const paid = parseISO(data.cvPaidDate);
    const validUntil = parseISO(data.cvValidUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.max(0, differenceInCalendarDays(validUntil, today));
    cvDaysLeft = daysLeft;
    cvTooltipNode = (
      <div className="space-y-1 text-xs">
        <div className="font-semibold">ЧВ оплачен</div>
        <div>Оплата: {format(paid, "d MMMM yyyy", { locale: ru })}</div>
        <div>Действует до: {format(validUntil, "d MMMM yyyy", { locale: ru })} вкл.</div>
        <div className={daysLeft <= 3 ? "text-orange-300 font-medium" : "text-gray-300 dark:text-gray-400"}>
          Осталось дней: {daysLeft}
          {daysLeft <= 3 && " — скоро нужна оплата"}
        </div>
      </div>
    );
  } else if (cvOk && data.membershipKind === "one_time_bv" && data.cvPaidDate) {
    cvTooltipNode = (
      <div className="space-y-1 text-xs">
        <div className="font-semibold">БВ оплачен</div>
        <div>Дата: {format(parseISO(data.cvPaidDate), "d MMMM yyyy", { locale: ru })}</div>
        <div className="text-gray-300 dark:text-gray-400">Разовая оплата на этот день</div>
      </div>
    );
  } else if (cvOk) {
    cvTooltipNode = <span className="text-xs">ЧВ/БВ оплачено</span>;
  } else {
    cvTooltipNode = <span className="text-xs">ЧВ/БВ не оплачено</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {showMembership && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border cursor-help ${
                !cvOk
                  ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                  : cvDaysLeft !== null && cvDaysLeft <= 3
                  ? "bg-orange-100 text-orange-700 border-orange-400 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                  : "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
              }`}
              data-testid={`badge-payment-cv-${studentId}`}
            >
              <Wallet className="h-2.5 w-2.5" />
              {cvOk ? (
                <>
                  {cvLabel}
                  {cvDaysLeft !== null && cvDaysLeft <= 3 && (
                    <span className="ml-0.5">·{cvDaysLeft}д</span>
                  )}
                </>
              ) : (
                "ЧВ ✗"
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">{cvTooltipNode}</TooltipContent>
        </Tooltip>
      )}
      {showTrainerPayment && (
        <span
          className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border ${
            trainerOk
              ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
              : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
          }`}
          title={trainerOk ? "Оплата тренеру есть" : "Нет оплаты тренеру"}
          data-testid={`badge-payment-trainer-${studentId}`}
        >
          <Dumbbell className="h-2.5 w-2.5" />
          {trainerOk ? trainerLabel : "✗"}
        </span>
      )}
    </span>
  );
}
