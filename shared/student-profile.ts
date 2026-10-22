import { z } from "zod";
import { birthDateValidationError } from "./birth-date";

/**
 * Валидация редактирования профиля ученика.
 *
 * Схема живёт отдельно от schema.ts намеренно: schema.ts описывает таблицы через
 * drizzle-orm/pg-core, и любой value-импорт оттуда (например, zodResolver в форме)
 * затягивал весь ORM в браузерный бандл — ~55 kB мёртвого для клиента кода.
 * Здесь только zod, поэтому клиент тянет этот файл, а сервер по-прежнему
 * реэкспортирует схему из schema.ts.
 */
export const updateStudentProfileSchema = z.object({
  firstName: z.string().trim().min(1, "Укажите имя"),
  lastName: z.string().trim().min(1, "Укажите фамилию"),
  middleName: z.string().trim().nullable().optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD")
    .superRefine((val, ctx) => {
      const err = birthDateValidationError(val, "optional");
      if (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
      }
    }),
  phone: z.string().trim().min(10, "Укажите корректный телефон"),
  // Legacy single-representative field (used by self-registration)
  parentFullName: z.string().trim().nullable().optional(),
  parentPhone: z.string().trim().nullable().optional(),
  // Detailed representative fields (filled by parent in profile)
  motherFullName: z.string().trim().nullable().optional(),
  motherPhone: z.string().trim().nullable().optional(),
  fatherFullName: z.string().trim().nullable().optional(),
  fatherPhone: z.string().trim().nullable().optional(),
  guardianFullName: z.string().trim().nullable().optional(),
  guardianPhone: z.string().trim().nullable().optional(),
});
