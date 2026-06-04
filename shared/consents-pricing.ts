import type { Document } from "./schema";

export const DOCUMENT_KIND_REQUIRED = "required" as const;
export const DOCUMENT_KIND_PRICING = "pricing" as const;
export type DocumentKind = typeof DOCUMENT_KIND_REQUIRED | typeof DOCUMENT_KIND_PRICING;

export function documentKind(doc: Pick<Document, "kind">): DocumentKind {
  return doc.kind === DOCUMENT_KIND_PRICING ? DOCUMENT_KIND_PRICING : DOCUMENT_KIND_REQUIRED;
}

export function isRequiredDocument(doc: Pick<Document, "kind">): boolean {
  return documentKind(doc) === DOCUMENT_KIND_REQUIRED;
}

export function isPricingDocument(doc: Pick<Document, "kind">): boolean {
  return documentKind(doc) === DOCUMENT_KIND_PRICING;
}

export function filterRequiredDocuments(docs: Document[]): Document[] {
  return docs.filter(isRequiredDocument);
}

export function filterPricingDocuments(docs: Document[]): Document[] {
  return docs.filter(isPricingDocument);
}

export type SessionPriceBreakdown = {
  serviceId: string | null;
  serviceName: string;
  basePriceRub: number;
  surchargeRub: number;
  totalPriceRub: number;
  surcharges: { documentId: string; title: string; amountRub: number }[];
};

export function computeSessionPrice(params: {
  service: { id: string; name: string; priceRub: number } | null;
  documents: Document[];
  signedDocumentIds: Set<string>;
}): SessionPriceBreakdown {
  const serviceName = params.service?.name ?? "Тренировка";
  const basePriceRub = params.service?.priceRub ?? 0;
  const surcharges: SessionPriceBreakdown["surcharges"] = [];

  for (const doc of params.documents) {
    if (!isPricingDocument(doc) || !doc.isActive) continue;
    if (params.signedDocumentIds.has(doc.id)) continue;
    const amountRub = doc.priceSurchargeRub ?? 0;
    if (amountRub > 0) {
      surcharges.push({ documentId: doc.id, title: doc.title, amountRub });
    }
  }

  const surchargeRub = surcharges.reduce((sum, s) => sum + s.amountRub, 0);
  return {
    serviceId: params.service?.id ?? null,
    serviceName,
    basePriceRub,
    surchargeRub,
    totalPriceRub: basePriceRub + surchargeRub,
    surcharges,
  };
}

export function missingRequiredDocumentIds(
  activeDocs: Document[],
  signedDocumentIds: Set<string>,
): string[] {
  return filterRequiredDocuments(activeDocs)
    .filter((d) => !signedDocumentIds.has(d.id))
    .map((d) => d.id);
}
