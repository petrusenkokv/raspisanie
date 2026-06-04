import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Document } from "@shared/schema";
import { filterPricingDocuments } from "@shared/consents-pricing";
import { Loader2, FileText, Save } from "lucide-react";
import { DocumentsManagerDialog } from "./documents-manager-dialog";

type Props = {
  enabled?: boolean;
};

export function TrainerPricingSettings({ enabled = true }: Props) {
  const { toast } = useToast();
  const [docsOpen, setDocsOpen] = useState(false);
  const [surcharges, setSurcharges] = useState<Record<string, string>>({});

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/trainer/documents"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/trainer/documents");
      return r.json();
    },
    enabled,
    staleTime: 0,
  });

  const pricingDocs = filterPricingDocuments(documents);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const doc of pricingDocs) {
      next[doc.id] = String(doc.priceSurchargeRub ?? 0);
    }
    setSurcharges(next);
  }, [documents]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/trainer/documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ id, priceSurchargeRub }: { id: string; priceSurchargeRub: number }) => {
      const r = await apiRequest("PATCH", `/api/trainer/documents/${id}`, {
        priceSurchargeRub: Math.max(0, priceSurchargeRub),
      });
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Надбавка сохранена" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-sm font-medium">Надбавка без согласия (фото/видео)</p>
        <p className="text-sm text-muted-foreground">
          Если ученик не ставит галочку при регистрации или в профиле, к цене тренировки добавляется эта сумма.
        </p>
        {pricingDocs.length === 0 ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Нет документов с типом «цена». Создайте документ в разделе документов ниже.
          </p>
        ) : (
          pricingDocs.map((doc) => (
            <div key={doc.id} className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium">«{doc.title}»</p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                  <Label htmlFor={`surcharge-${doc.id}`}>Надбавка (₽)</Label>
                  <Input
                    id={`surcharge-${doc.id}`}
                    type="number"
                    min={0}
                    value={surcharges[doc.id] ?? "0"}
                    onChange={(e) =>
                      setSurcharges((prev) => ({ ...prev, [doc.id]: e.target.value }))
                    }
                  />
                </div>
                <Button
                  className="sm:w-auto w-full"
                  onClick={() =>
                    saveMutation.mutate({
                      id: doc.id,
                      priceSurchargeRub: Number(surcharges[doc.id]) || 0,
                    })
                  }
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Сохранить
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Button variant="outline" className="w-full" onClick={() => setDocsOpen(true)}>
        <FileText className="h-4 w-4 mr-2" />
        Документы и согласия
      </Button>

      <DocumentsManagerDialog open={docsOpen} onOpenChange={setDocsOpen} />
    </div>
  );
}
