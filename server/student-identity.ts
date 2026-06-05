/** Groups one person across duplicate accounts (parent/child phones, re-registration). */
export function studentIdentityKey(user: {
  phone: string;
  firstName: string;
  lastName?: string | null;
}): string {
  const digits = user.phone.replace(/\D/g, "");
  if (digits.length >= 9) return `phone:${digits.slice(0, 9)}`;
  const first = user.firstName.trim().toLowerCase();
  const last = (user.lastName ?? "").trim().toLowerCase();
  if (first || last) return `name:${first}:${last}`;
  return `unknown:${digits || "anon"}`;
}
