import { calculateAgeYears } from "./birth-date";

export type LegalRepresentativeFields = {
  motherFullName?: string | null;
  motherPhone?: string | null;
  fatherFullName?: string | null;
  fatherPhone?: string | null;
};

export function trimRepresentativeFields(fields: LegalRepresentativeFields): LegalRepresentativeFields {
  const trim = (v?: string | null) => {
    const s = v?.trim();
    return s || null;
  };
  return {
    motherFullName: trim(fields.motherFullName),
    motherPhone: trim(fields.motherPhone),
    fatherFullName: trim(fields.fatherFullName),
    fatherPhone: trim(fields.fatherPhone),
  };
}

function phoneDigitsOk(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return phone.replace(/\D/g, "").length >= 10;
}

/** Validate mother/father contact rows for trainer-created students. */
export function legalRepresentativeFieldsError(
  birthDate: string | null | undefined,
  rawFields: LegalRepresentativeFields,
): string | null {
  const fields = trimRepresentativeFields(rawFields);
  const age = calculateAgeYears(birthDate ?? null);

  if (fields.motherFullName && !phoneDigitsOk(fields.motherPhone)) {
    return "Укажите телефон матери";
  }
  if (fields.motherPhone && !fields.motherFullName) {
    return "Укажите ФИО матери";
  }
  if (fields.fatherFullName && !phoneDigitsOk(fields.fatherPhone)) {
    return "Укажите телефон отца";
  }
  if (fields.fatherPhone && !fields.fatherFullName) {
    return "Укажите ФИО отца";
  }

  if (age !== null && age < 14) {
    if (!birthDate) {
      return "Укажите дату рождения для ученика младше 14 лет";
    }
    const hasMother = !!fields.motherFullName && phoneDigitsOk(fields.motherPhone);
    const hasFather = !!fields.fatherFullName && phoneDigitsOk(fields.fatherPhone);
    if (!hasMother && !hasFather) {
      return "Для ученика младше 14 лет укажите хотя бы одного родителя (ФИО и телефон)";
    }
  }

  return null;
}
