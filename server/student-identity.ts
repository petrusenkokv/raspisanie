/** Groups one person across duplicate accounts (re-registration, parent/child). */
export function studentIdentityKey(user: {
  phone: string;
  firstName: string;
  lastName?: string | null;
}): string {
  const first = user.firstName.trim().toLowerCase();
  const last = (user.lastName ?? "").trim().toLowerCase();
  if (first && last) return `name:${first}:${last}`;

  const digits = user.phone.replace(/\D/g, "");
  if (digits.length >= 9) return `phone:${digits.slice(0, 9)}`;
  if (first) return `name:${first}:`;
  return `unknown:${digits || "anon"}`;
}
