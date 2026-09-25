import { z } from "zod";

/**
 * Прогрессивные тарифы абонементов тренера (групповые занятия).
 *
 * Каждый уровень задаёт диапазон количества тренировок (minSessions..maxSessions)
 * и цену за ОДНУ тренировку в этом диапазоне. Сумма абонемента = count × ставка.
 *
 * Базовая цена по умолчанию — ставка первого уровня (по умолчанию 700 ₽).
 * «Индивидуальная тренировка» — НЕ уровень, а отдельная выборочная опция:
 * её включает тренер (в карточке ученика) или сам ученик (в профиле),
 * цена задаётся отдельным полем настройки (individualTrainingPriceRub, по умолчанию 1000 ₽).
 */

export type PricingTier = {
  id: string;
  label: string;
  minSessions: number;
  maxSessions: number | null; // null = без верхней границы
  pricePerSessionRub: number;
};

export const pricingTierSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "Укажите название тарифа"),
  minSessions: z.number().int().min(1),
  maxSessions: z.number().int().min(1).nullable(),
  pricePerSessionRub: z.number().int().min(0),
});

export const DEFAULT_PRICING_TIERS: PricingTier[] = [
  { id: "t1_3", label: "Абонемент 1–3", minSessions: 1, maxSessions: 3, pricePerSessionRub: 700 },
  { id: "t4_7", label: "Абонемент 4–7", minSessions: 4, maxSessions: 7, pricePerSessionRub: 650 },
  { id: "t8_11", label: "Абонемент 8–11", minSessions: 8, maxSessions: 11, pricePerSessionRub: 600 },
  { id: "t12", label: "Абонемент 12+", minSessions: 12, maxSessions: null, pricePerSessionRub: 550 },
];

export const DEFAULT_INDIVIDUAL_TRAINING_PRICE_RUB = 1000;

export function serializePricingTiers(tiers: PricingTier[]): string {
  return JSON.stringify(tiers);
}

export function parsePricingTiers(raw: string | null | undefined): PricingTier[] {
  if (!raw) return DEFAULT_PRICING_TIERS.map((t) => ({ ...t }));
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_PRICING_TIERS.map((t) => ({ ...t }));
    }
    return parsed
      .filter(
        (t): t is PricingTier =>
          !!t &&
          typeof (t as PricingTier).id === "string" &&
          typeof (t as PricingTier).label === "string" &&
          Number.isFinite((t as PricingTier).minSessions) &&
          ((t as PricingTier).maxSessions == null || Number.isFinite((t as PricingTier).maxSessions)) &&
          Number.isFinite((t as PricingTier).pricePerSessionRub),
      )
      .map((t) => ({
        id: String(t.id),
        label: String(t.label),
        minSessions: Math.max(1, Math.floor(Number(t.minSessions))),
        maxSessions: t.maxSessions == null ? null : Math.max(1, Math.floor(Number(t.maxSessions))),
        pricePerSessionRub: Math.max(0, Math.floor(Number(t.pricePerSessionRub))),
      }));
  } catch {
    return DEFAULT_PRICING_TIERS.map((t) => ({ ...t }));
  }
}

/** Подбор уровня для заданного количества тренировок (первый подходящий диапазон). */
export function findPricingTier(tiers: PricingTier[], sessionCount: number): PricingTier | null {
  const count = Math.max(1, Math.floor(sessionCount));
  const exact = tiers.find((t) => t.minSessions === t.maxSessions && t.minSessions === count);
  if (exact) return exact;
  return (
    tiers.find(
      (t) => t.minSessions <= count && (t.maxSessions == null || count <= t.maxSessions),
    ) ?? null
  );
}

export type SessionRate = {
  label: string;
  pricePerSessionRub: number;
};

/**
 * Ставка за одно занятие для ученика:
 * - если у ученика включена индивидуальная тренировка → individualPriceRub (для любого количества занятий);
 * - иначе — ставка уровня абонемента для заданного количества (базовый = первый уровень, обычно 700 ₽).
 */
export function resolveSessionRate(
  tiers: PricingTier[],
  individualPriceRub: number,
  wantsIndividualTraining: boolean,
  sessionCount: number,
): SessionRate {
  const count = Math.max(1, Math.floor(sessionCount));
  if (wantsIndividualTraining) {
    return {
      label: "Индивидуальная тренировка",
      pricePerSessionRub: Math.max(0, Math.floor(Number(individualPriceRub) || 0)),
    };
  }
  const tier = findPricingTier(tiers, count) ?? tiers[0] ?? null;
  if (!tier) {
    return { label: "Тренировка", pricePerSessionRub: 0 };
  }
  return { label: tier.label, pricePerSessionRub: tier.pricePerSessionRub };
}

export type PackagePrice = {
  tierLabel: string;
  count: number;
  pricePerSessionRub: number;
  totalPriceRub: number;
};

export type PackagePriceOptions = {
  /** Цена индивидуальной тренировки (применяется для любого количества занятий, если включена опция). */
  individualPriceRub?: number;
  /** Ученик выбрал индивидуальную тренировку. */
  wantsIndividualTraining?: boolean;
};

/** Стоимость абонемента: ставка × количество тренировок (с учётом опции индивидуальной). */
export function computeTrainerPackagePrice(
  tiers: PricingTier[],
  sessionCount: number,
  options: PackagePriceOptions = {},
): PackagePrice | null {
  const count = Math.max(1, Math.floor(sessionCount));
  const rate = resolveSessionRate(
    tiers,
    options.individualPriceRub ?? DEFAULT_INDIVIDUAL_TRAINING_PRICE_RUB,
    options.wantsIndividualTraining === true,
    count,
  );
  return {
    tierLabel: rate.label,
    count,
    pricePerSessionRub: rate.pricePerSessionRub,
    totalPriceRub: rate.pricePerSessionRub * count,
  };
}