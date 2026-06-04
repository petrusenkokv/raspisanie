import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { type Document, type StudentWithConsents } from "@shared/schema";
import { isPricingDocument } from "@shared/consents-pricing";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DocumentViewDialog } from "./document-view-dialog";

type Props = {
  documents: Document[];
  acceptedByDocId: Record<string, boolean>;
  onToggle: (documentId: string, accepted: boolean) => void;
  onViewDocument: (doc: Document) => void;
  disabled?: boolean;
  showSelectAll?: boolean;
  hint?: string;
};

export function TrainerStudentConsentsBlock({
  documents,
  acceptedByDocId,
  onToggle,
  onViewDocument,
  disabled = false,
  showSelectAll = true,
  hint = "Отметьте документы, которые ученик уже подписал на бумаге. Без галочек ученик увидит их при первом входе.",
}: Props) {
  if (documents.length === 0) return null;

  const allSelected = documents.every((d) => acceptedByDocId[d.id]);

  const handleSelectAll = () => {
    const next = !allSelected;
    for (const doc of documents) {
      onToggle(doc.id, next);
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-slate-50/80 dark:bg-slate-900/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Согласия с документами</p>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </div>
        {showSelectAll && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 h-8 text-xs"
            onClick={handleSelectAll}
            disabled={disabled}
          >
            {allSelected ? "Снять все" : "Отметить все"}
          </Button>
        )}
      </div>
      {documents.map((doc) => (
        <label
          key={doc.id}
          className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-2 bg-white dark:bg-gray-900"
        >
          <Checkbox
            checked={!!acceptedByDocId[doc.id]}
            onCheckedChange={(v) => onToggle(doc.id, !!v)}
            disabled={disabled}
            className="mt-0.5"
            data-testid={`trainer-consent-${doc.id}`}
          />
          <span className="flex-1 min-w-0">
            Согласие с{" "}
            <button
              type="button"
              className="text-blue-600 underline text-left"
              onClick={(e) => {
                e.preventDefault();
                onViewDocument(doc);
              }}
            >
              «{doc.title}»
            </button>
            {isPricingDocument(doc) && !acceptedByDocId[doc.id] && (
              <span className="block text-xs text-muted-foreground mt-0.5">
                Необязательно. Без галочки цена выше на {doc.priceSurchargeRub ?? 0} ₽
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

export function TrainerStudentConsentsManager({
  studentId,
  consents,
  hint,
}: {
  studentId: string;
  consents: StudentWithConsents["consents"];
  hint?: string;
}) {
  const { toast } = useToast();
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/documents");
      return r.json();
    },
    staleTime: 60_000,
  });

  const acceptedByDocId = useMemo(() => {
    const signed = new Set(consents.map((c) => c.documentId));
    const map: Record<string, boolean> = {};
    for (const doc of documents) {
      map[doc.id] = signed.has(doc.id);
    }
    return map;
  }, [documents, consents]);

  const toggleMutation = useMutation({
    mutationFn: async ({
      documentId,
      accepted,
    }: {
      documentId: string;
      accepted: boolean;
    }) => {
      const r = await apiRequest("POST", `/api/users/${studentId}/consents/toggle`, {
        documentId,
        accepted,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students", studentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/students"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", studentId, "account-summary"] });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const handleToggle = (documentId: string, accepted: boolean) => {
    toggleMutation.mutate({ documentId, accepted });
  };

  return (
    <>
      <TrainerStudentConsentsBlock
        documents={documents}
        acceptedByDocId={acceptedByDocId}
        onToggle={handleToggle}
        onViewDocument={setViewingDoc}
        disabled={toggleMutation.isPending}
        hint={hint}
      />
      <DocumentViewDialog
        document={viewingDoc}
        open={!!viewingDoc}
        onOpenChange={(o) => !o && setViewingDoc(null)}
      />
    </>
  );
}
