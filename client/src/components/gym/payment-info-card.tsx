import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  computeTrainerPackagePrice,
  DEFAULT_INDIVIDUAL_TRAINING_PRICE_RUB,
  DEFAULT_PRICING_TIERS,
  type PricingTier,
} from "@shared/pricing-tiers";
import type { PaymentQr, PaymentReport } from "@shared/schema";
import {
  Banknote,
  Phone,
  QrCode,
  Copy,
  Check,
  CheckCircle2,
  Dumbbell,
  Send,
} from "lucide-react";

type SettingsResponse = {
  paymentPhone?: string | null;
  paymentQrs?: PaymentQr[];
  pricingTiers?: PricingTier[];
  individualTrainingPriceRub?: number;
};

type Props = {
  /** Ученик выбрал индивидуальные тренировки. */
  wantsIndividualTraining?: boolean;
  /** Регистрация ещё не одобрена тренером (пробная тренировка): показываем только разовый QR зала. */
  pendingApproval?: boolean;
};

/** Привести путь к QR к веб-виду: client\public\qr.png → /qr.png */
function normalizeQrUrl(raw: string): string {
  let v = String(raw || "").trim();
  if (!v) return "";
  if (/^data:image\//i.test(v)) return v;
  v = v.replace(/^client[\\/]+public[\\/]+/i, "");
  v = v.replace(/\\/g, "/");
  if (!/^https?:\/\//i.test(v) && !v.startsWith("/")) v = "/" + v;
  return v;
}

/**
 * QR-код для пробной тренировки (пока регистрация не одобрена тренером):
 * приоритет — код с «300» в названии (разовое посещение), иначе первый из списка.
 */
function pickTrialQrs(
  qrs: { id: string; name: string; url: string }[],
): { id: string; name: string; url: string }[] {
  if (qrs.length === 0) return [];
  const trial = qrs.find((q) => /300/i.test(q.name)) ?? qrs[0];
  return [trial];
}

export function PaymentInfoCard({
  wantsIndividualTraining = false,
  pendingApproval = false,
}: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [qrDialog, setQrDialog] = useState<{ name: string; url: string } | null>(null);
  const [trainerCount, setTrainerCount] = useState<number>(1);

  const { data } = useQuery<SettingsResponse>({
    queryKey: ["/api/schedule/settings"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/schedule/settings");
      return r.json();
    },
    staleTime: 0,
  });

  const queryClient = useQueryClient();
  const { data: reportsData } = useQuery<{ reports: PaymentReport[] }>({
    queryKey: ["/api/payments/my-reports"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/payments/my-reports");
      return r.json();
    },
    staleTime: 0,
  });

  const phone = data?.paymentPhone?.trim() || "";
  const qrs = (Array.isArray(data?.paymentQrs) ? data.paymentQrs : []).map((q) => ({
    ...q,
    url: normalizeQrUrl(q.url),
  }));
  // До одобрения тренером ученик видит только QR разового посещения (пробная тренировка).
  const visibleQrs = pendingApproval ? pickTrialQrs(qrs) : qrs;
  const tiers =
    Array.isArray(data?.pricingTiers) && data.pricingTiers.length > 0
      ? data.pricingTiers
      : DEFAULT_PRICING_TIERS;
  const individualPrice = data?.individualTrainingPriceRub ?? DEFAULT_INDIVIDUAL_TRAINING_PRICE_RUB;

  // Блок оплаты показываем любому ученику (в т.ч. только что зарегистрированному),
  // даже если тренер ещё не указал реквизиты — кнопка «Я оплатил» всегда доступна.
  const count = Math.max(1, Math.floor(trainerCount) || 1);
  const pkg = computeTrainerPackagePrice(tiers, count, {
    individualPriceRub: individualPrice,
    wantsIndividualTraining,
  });

  const reports = reportsData?.reports ?? [];
  // Отметка «Я оплатил» видна, пока тренер не подтвердит оплату ответным действием:
  // запишет ЧВ/БВ зала, создаст абонемент или одобрит регистрацию.
  const hallReported = (name: string) =>
    reports.some((r) => r.kind === "hall" && (r.qrName ?? "") === name && r.trainerConfirmed !== true);
  const trainerReport = reports.find((r) => r.kind === "trainer");
  const trainerReported = !!trainerReport && trainerReport.trainerConfirmed !== true;

  const notifyMutation = useMutation({
    mutationFn: async (payload: {
      kind: "hall" | "trainer";
      amountRub?: number;
      count?: number;
      qrName?: string;
    }) => {
      const r = await apiRequest("POST", "/api/payments/student-notify", payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/my-reports"] });
      toast({ title: "Уведомление отправлено тренеру" });
    },
    onError: (e: any) =>
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" }),
  });

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-emerald-50/70 dark:bg-emerald-950/20">
      <p className="text-sm font-semibold flex items-center gap-2">
        <Banknote className="h-4 w-4 text-emerald-600" />
        Оплата
      </p>

      {/* ── Тренажёрный зал ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Тренажёрный зал (посещение)
        </p>
        {visibleQrs.length > 0 ? (
          visibleQrs.map((qr) => (
            <div
              key={qr.id}
              className="rounded-md border bg-white dark:bg-gray-900 px-3 py-2 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{qr.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={() => setQrDialog({ name: qr.name, url: qr.url })}
                  data-testid={`payment-qr-${qr.id}`}
                >
                  <QrCode className="h-3.5 w-3.5 mr-1" />
                  Показать QR
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-xs w-full whitespace-normal leading-snug ${
                  hallReported(qr.name)
                    ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                    : ""
                }`}
                onClick={() => notifyMutation.mutate({ kind: "hall", qrName: qr.name })}
                disabled={notifyMutation.isPending || hallReported(qr.name)}
              >
                {hallReported(qr.name) ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Вы сообщили об оплате зала ({qr.name})
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Я оплатил зал ({qr.name})
                  </>
                )}
              </Button>
            </div>
          ))
        ) : (
          <div className="rounded-md border bg-white dark:bg-gray-900 px-3 py-2 space-y-1.5">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 text-xs w-full whitespace-normal leading-snug ${
                hallReported("")
                  ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                  : ""
              }`}
              onClick={() => notifyMutation.mutate({ kind: "hall" })}
              disabled={notifyMutation.isPending || hallReported("")}
              data-testid="button-paid-hall-generic"
            >
              {hallReported("") ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Вы сообщили об оплате зала
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Я оплатил зал
                </>
              )}
            </Button>
            <p className="text-[11px] text-gray-500">
              QR-код для оплаты появится здесь, когда тренер добавит его в настройках.
              Кнопка «Я оплатил зал» уже работает.
            </p>
          </div>
        )}
      </div>

      {pendingApproval && (
        <p className="text-[11px] text-gray-500">
          Это пробная тренировка — тренер проведёт тесты физической подготовленности.
          Другие способы оплаты и QR-коды появятся после одобрения регистрации.
        </p>
      )}

      {/* ── Тренер ── */}
      {!pendingApproval && (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Тренер (за работу)
        </p>
        {phone && (
          <div className="flex items-center gap-2 flex-wrap rounded-md border bg-white dark:bg-gray-900 px-3 py-2 min-w-0">
            <Phone className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="text-sm font-medium truncate flex-1" data-testid="payment-phone">
              {phone}
            </span>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={copyPhone}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="ml-1">{copied ? "Готово" : "Копировать"}</span>
            </Button>
            <a
              href={`tel:${phone.replace(/[^+\d]/g, "")}`}
              className="text-xs text-emerald-700 dark:text-emerald-300 underline shrink-0"
            >
              Позвонить
            </a>
          </div>
        )}

          <div className="rounded-md border bg-white dark:bg-gray-900 px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-xs text-muted-foreground">Сколько тренировок оплачиваете?</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="number"
                min={1}
                max={50}
                value={trainerCount}
                onChange={(e) => setTrainerCount(Number(e.target.value) || 1)}
                className="h-8 w-24 text-sm"
                data-testid="input-trainer-count"
              />
              {pkg && (
                <div className="text-xs min-w-0">
                  <span className="font-medium">{pkg.tierLabel}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    • {pkg.pricePerSessionRub.toLocaleString("ru-RU")} ₽/занятие
                  </span>
                </div>
              )}
            </div>
            {pkg && (
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Итого: {pkg.totalPriceRub.toLocaleString("ru-RU")} ₽
              </p>
            )}
            <Button
              size="sm"
              className={`w-full whitespace-normal leading-snug ${
                trainerReported
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                  : ""
              }`}
              onClick={() =>
                pkg &&
                notifyMutation.mutate({
                  kind: "trainer",
                  count: pkg.count,
                  amountRub: pkg.totalPriceRub,
                })
              }
              disabled={notifyMutation.isPending || !pkg || trainerReported}
              data-testid="button-paid-trainer"
            >
              {trainerReported ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Вы сообщили об оплате тренировок
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {pkg
                    ? `Я оплатил ${pkg.count} ${pkg.count === 1 ? "тренировку" : pkg.count < 5 ? "тренировки" : "тренировок"} (${pkg.totalPriceRub.toLocaleString("ru-RU")} ₽)`
                    : "Я оплатил тренировки"}
                </>
              )}
            </Button>
            {trainerReported && trainerReport && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                ✓ Уже сообщили
                {trainerReport.count ? `: ${trainerReport.count} шт.` : ""}
                {trainerReport.amountRub
                  ? ` · ${trainerReport.amountRub.toLocaleString("ru-RU")} ₽`
                  : ""}
                . Тренер получил уведомление.
              </p>
            )}
            {!trainerReported && (
              <p className="text-[11px] text-gray-500">
                {phone
                  ? "Переведите сумму на телефон тренера и нажмите кнопку — тренер получит уведомление и отметит оплату."
                  : "Нажмите кнопку — тренер получит уведомление об оплате и свяжется с вами."}
              </p>
            )}
            {!phone && qrs.length === 0 && (
              <p className="text-[11px] text-gray-500">
                Номер тренера для перевода появится здесь, когда тренер добавит реквизиты в
                настройках. Кнопка «Я оплатил» уже работает.
              </p>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!qrDialog} onOpenChange={(open) => !open && setQrDialog(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle>{qrDialog?.name || "QR-код для оплаты"}</DialogTitle>
            <DialogDescription>Открой приложение банка, а потом сканируй.</DialogDescription>
          </DialogHeader>
          {qrDialog && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDialog.url}
                alt={qrDialog.name}
                className="max-h-[60vh] w-auto rounded-lg border"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}