import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Banknote, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DocumentViewDialog } from "@/components/gym/document-view-dialog";
import type { Document, TrainerService } from "@shared/schema";
import { isPricingDocument, isRequiredDocument } from "@shared/consents-pricing";

type DocWithAccepted = Document & { accepted: boolean };

type AccountSummaryResponse = {
  sessionPrice: {
    serviceId: string | null;
    serviceName: string;
    basePriceRub: number;
    surchargeRub: number;
    totalPriceRub: number;
    surcharges: { documentId: string; title: string; amountRub: number }[];
  };
  signedDocumentIds: string[];
  pendingRequiredCount: number;
  trainerPaymentRemaining: number | null;
  trainerPaymentTotal: number | null;
  documents: DocWithAccepted[];
};

interface Props {
  userId: string;
  heading?: string;
  showServicePicker?: boolean;
}

export function StudentAccountSection({
  userId,
  heading = "Стоимость и согласия",
  showServicePicker = true,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<DocWithAccepted | null>(null);

  const summaryKey = ["/api/users", userId, "account-summary"] as const;

  const { data, isLoading } = useQuery<AccountSummaryResponse>({
    queryKey: summaryKey,
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/users/${userId}/account-summary`);
      return r.json();
    },
    enabled: !!userId,
    staleTime: 0,
  });

  const { data: services = [] } = useQuery<TrainerService[]>({
    queryKey: ["/api/services"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/services");
      return r.json();
    },
    enabled: showServicePicker,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: summaryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
    queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
  };

  const serviceMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      const r = await apiRequest("PATCH", `/api/users/${userId}/selected-service`, { serviceId });
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Услуга сохранена" });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const consentMutation = useMutation({
    mutationFn: async ({ documentId, accepted }: { documentId: string; accepted: boolean }) => {
      const r = await apiRequest("POST", `/api/users/${userId}/consents/toggle`, {
        documentId,
        accepted,
      });
      return r.json();
    },
    onSuccess: (_data, vars) => {
      invalidate();
      toast({
        title: vars.accepted ? "Согласие принято" : "Согласие отозвано",
      });
      setRevokeTarget(null);
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const handleConsentChange = (doc: DocWithAccepted, next: boolean) => {
    if (!next) {
      setRevokeTarget(doc);
      return;
    }
    consentMutation.mutate({ documentId: doc.id, accepted: true });
  };

  const confirmRevoke = () => {
    if (!revokeTarget) return;
    consentMutation.mutate({ documentId: revokeTarget.id, accepted: false });
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
      </div>
    );
  }

  const price = data.sessionPrice;
  const revokeWarning = revokeTarget
    ? isRequiredDocument(revokeTarget)
      ? "После отзыва вы не сможете записываться на тренировки, пока снова не примете этот документ. Тренер получит уведомление."
      : isPricingDocument(revokeTarget) && (revokeTarget.priceSurchargeRub ?? 0) > 0
        ? `Стоимость одной тренировки увеличится на ${revokeTarget.priceSurchargeRub} ₽ (итого ${price.basePriceRub + (revokeTarget.priceSurchargeRub ?? 0)} ₽). Запись останется доступной. Тренер получит уведомление.`
        : "Тренер получит уведомление об отзыве согласия."
    : "";

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-slate-50/80 dark:bg-slate-900/40">
      <p className="text-sm font-semibold flex items-center gap-2">
        <Banknote className="h-4 w-4 text-blue-600" />
        {heading}
      </p>

      {showServicePicker && services.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs">Услуга</Label>
          <Select
            value={price.serviceId ?? undefined}
            onValueChange={(v) => serviceMutation.mutate(v)}
            disabled={serviceMutation.isPending}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Выберите услугу" />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {s.priceRub} ₽
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="rounded-md border bg-white dark:bg-gray-900 p-3 space-y-1">
        <p className="text-xs text-muted-foreground">Цена за одну тренировку</p>
        <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
          {price.totalPriceRub} ₽
        </p>
        <p className="text-xs text-muted-foreground">
          {price.serviceName}: {price.basePriceRub} ₽
          {price.surchargeRub > 0 &&
            ` + надбавка ${price.surchargeRub} ₽`}
        </p>
        {price.surcharges.length > 0 && (
          <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc pl-4 mt-1">
            {price.surcharges.map((s) => (
              <li key={s.documentId}>
                без «{s.title}»: +{s.amountRub} ₽
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.trainerPaymentTotal != null && (
        <p className="text-xs text-muted-foreground">
          Оплачено тренировок тренеру:{" "}
          <span className="font-medium text-foreground">
            {data.trainerPaymentRemaining ?? 0} из {data.trainerPaymentTotal}
          </span>{" "}
          (осталось / всего в абонементе)
        </p>
      )}

      {data.pendingRequiredCount > 0 && (
        <p className="text-xs text-red-600 dark:text-red-400 font-medium">
          Примите обязательные документы, чтобы записываться на тренировки.
        </p>
      )}

      <Separator />

      <div className="space-y-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Документы и согласия
        </p>
        {data.documents.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет активных документов</p>
        ) : (
          data.documents.map((doc) => (
            <label
              key={doc.id}
              className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-2 bg-white dark:bg-gray-900"
            >
              <Checkbox
                checked={doc.accepted}
                disabled={consentMutation.isPending}
                onCheckedChange={(v) => handleConsentChange(doc, !!v)}
                className="mt-0.5"
              />
              <span className="flex-1 min-w-0">
                <span className="font-medium">{doc.title}</span>
                {isPricingDocument(doc) && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Необязательно. Без галочки: +{doc.priceSurchargeRub ?? 0} ₽ к цене
                  </span>
                )}
                {isRequiredDocument(doc) && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Обязательно для записи на тренировки
                  </span>
                )}
                <button
                  type="button"
                  className="text-xs text-blue-600 underline mt-1"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewingDoc(doc);
                  }}
                >
                  Прочитать
                </button>
              </span>
            </label>
          ))
        )}
      </div>

      <DocumentViewDialog
        document={viewingDoc}
        open={!!viewingDoc}
        onOpenChange={(o) => !o && setViewingDoc(null)}
      />

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отозвать согласие?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  Документ: <strong>«{revokeTarget.title}»</strong>
                  <br />
                  <br />
                  {revokeWarning}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke} disabled={consentMutation.isPending}>
              {consentMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Отозвать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
