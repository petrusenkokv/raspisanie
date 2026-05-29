/** Max plausible age for birth-date validation. */
export const MAX_BIRTH_AGE_YEARS = 120;

/** Self-registration as student (14+ without parent flow on same form). */
export const MIN_SELF_STUDENT_AGE = 14;

export function todayLocalStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Parse YYYY-MM-DD as local calendar date (no UTC shift). */
export function parseBirthDateStr(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function calculateAgeYears(birthDate: string | null | undefined): number | null {
  const b = parseBirthDateStr(birthDate);
  if (!b) return birthDate ? null : null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export function isBirthDateInFuture(dateStr: string): boolean {
  const trimmed = String(dateStr).trim();
  if (!parseBirthDateStr(trimmed)) return false;
  return trimmed > todayLocalStr();
}

export type BirthDateValidationKind =
  | "required"
  | "optional"
  | "adult"
  | "student-self"
  | "child";

export function birthDateValidationError(
  birthDate: string | null | undefined,
  kind: BirthDateValidationKind,
): string | null {
  const trimmed = birthDate != null ? String(birthDate).trim() : "";

  if (!trimmed) {
    if (kind === "optional") return null;
    return "Укажите дату рождения";
  }

  if (!parseBirthDateStr(trimmed)) {
    return "Некорректная дата рождения";
  }

  if (isBirthDateInFuture(trimmed)) {
    return "Дата рождения не может быть в будущем";
  }

  const age = calculateAgeYears(trimmed);
  if (age === null) {
    return "Некорректная дата рождения";
  }

  if (age > MAX_BIRTH_AGE_YEARS) {
    return `Укажите дату не ранее ${MAX_BIRTH_AGE_YEARS} лет назад`;
  }

  if (kind === "adult" || kind === "student-self") {
    if (age < MIN_SELF_STUDENT_AGE) {
      return "До 14 лет регистрация только как законный представитель ребёнка";
    }
  }

  if (kind === "child" && age >= 18) {
    return "Для совершеннолетнего используйте регистрацию «Записать себя»";
  }

  return null;
}

export function formatAgeYearsRu(age: number): string {
  const mod10 = age % 10;
  const mod100 = age % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${age} лет`;
  if (mod10 === 1) return `${age} год`;
  if (mod10 >= 2 && mod10 <= 4) return `${age} года`;
  return `${age} лет`;
}

/** Suffix for display after formatted date, e.g. " (25 лет)" or " (некорректная дата)". */
export function birthDateAgeSuffix(birthDate: string | null | undefined): string {
  if (!birthDate) return "";
  if (isBirthDateInFuture(birthDate)) return " (некорректная дата)";
  const age = calculateAgeYears(birthDate);
  if (age === null || age < 0) return " (некорректная дата)";
  return ` (${formatAgeYearsRu(age)})`;
}
