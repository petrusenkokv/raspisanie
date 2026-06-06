const normalizePart = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Full name key for duplicate account detection (Кудрова Елена Анатольевна). */
export function studentFullNameKey(user: {
  firstName: string;
  lastName?: string | null;
  middleName?: string | null;
}): string | null {
  const last = normalizePart(user.lastName);
  const first = normalizePart(user.firstName);
  const middle = normalizePart(user.middleName);
  if (!last || !first) return null;
  return `fio:${last}:${first}:${middle}`;
}

/** Groups one person across duplicate accounts (re-registration, parent/child). */
export function studentIdentityKey(user: {
  phone: string;
  firstName: string;
  lastName?: string | null;
  middleName?: string | null;
}): string {
  const fio = studentFullNameKey(user);
  if (fio) return fio;

  const first = normalizePart(user.firstName);
  const last = normalizePart(user.lastName);
  if (first.length >= 3) return `name:${first}`;
  if (first && last) return `name:${first}:${last.charAt(0)}`;

  const digits = user.phone.replace(/\D/g, "");
  if (digits.length >= 9) return `phone:${digits.slice(0, 9)}`;
  if (first) return `name:${first}:`;
  return `unknown:${digits || "anon"}`;
}
