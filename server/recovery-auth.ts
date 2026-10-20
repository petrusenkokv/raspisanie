/**
 * Аварийный (recovery) вход тренера.
 *
 * Смысл: у тренера всегда должен быть способ попасть в приложение, даже если
 * он поменял номер на свой настоящий и забыл его, или если аккаунт «поехал».
 *
 * Recovery-номера: 89991234567 и 79991234567. После normalizePhone() это один
 * и тот же номер, поэтому оба варианта считаются валидными ключами.
 *
 * Recovery-пароль берётся из переменной окружения TRAINER_RECOVERY_PASSWORD и
 * не хранится в коде (дефолт «12345» — только для локальной разработки).
 *
 * Вход по recovery-паролю одноразовый: он ставит mustChangePassword=true, и
 * клиент сразу требует сменить пароль. Постоянного бэкдора не остаётся.
 */

import { verifyPassword } from "./auth";

/** Номера в том виде, как их вводит человек. */
export const RECOVERY_PHONES = ["79991234567", "89991234567"] as const;

/** Номер в нормализованном виде (то, что возвращает normalizePhone). */
export const RECOVERY_PHONE_NORMALIZED = "79991234567";

/** Пароль для аварийного входа. В проде задаётся переменной окружения. */
export function getRecoveryPassword(): string {
  return process.env.TRAINER_RECOVERY_PASSWORD || "12345";
}

/**
 * Recovery-пароль задаётся в переменной окружения как обычный текст.
 * В БД он никогда не пишется в открытом виде — только bcrypt-хэшем.
 */
export async function matchesRecoveryPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  return verifyPassword(plain, getRecoveryPassword()) || verifyPassword(plain, stored);
}

/** true, если нормализованный номер совпадает с recovery-номером. */
export function isRecoveryPhone(normalizedPhone: string): boolean {
  return normalizedPhone === RECOVERY_PHONE_NORMALIZED;
}