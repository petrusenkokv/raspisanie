import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, time, date, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (students and trainer)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  middleName: text("middle_name"),
  birthDate: text("birth_date"), // YYYY-MM-DD
  trainerNotes: text("trainer_notes"),
  parentFullName: text("parent_full_name"),
  parentPhone: text("parent_phone"),
  motherFullName: text("mother_full_name"),
  motherPhone: text("mother_phone"),
  fatherFullName: text("father_full_name"),
  fatherPhone: text("father_phone"),
  guardianFullName: text("guardian_full_name"),
  guardianPhone: text("guardian_phone"),
  sickUntil: text("sick_until"), // YYYY-MM-DD; while set, student is on sick leave
  sickNote: text("sick_note"),
  isActive: boolean("is_active").notNull().default(true), // false = student paused/archived
  cvRestartDate: text("cv_restart_date"), // YYYY-MM-DD; when set, ignore ЧВ payments before this date
  role: text("role").notNull().default("student"), // "student" or "trainer"
  isVerified: boolean("is_verified").notNull().default(false),
  verificationCode: text("verification_code"),
  password: text("password").notNull().default(""),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Consent documents managed by trainer (rules, agreements, etc.)
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Records of which user accepted which document
export const userConsents = pgTable("user_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  acceptedAt: timestamp("accepted_at").defaultNow(),
});

// Time slots for the schedule (8:00-20:00)
export const timeSlots = pgTable("time_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(), // YYYY-MM-DD
  time: time("time").notNull(), // HH:MM format (08:00, 09:00, etc.)
  maxCapacity: integer("max_capacity").notNull().default(2), // current resolved capacity
  isManualCapacity: boolean("is_manual_capacity").notNull().default(false), // true => capacity manually overridden, ignore template/default
  isBlocked: boolean("is_blocked").notNull().default(false), // trainer can block slots
  blockReason: text("block_reason"), // null | 'manual' | 'template' | 'holiday'
  createdAt: timestamp("created_at").defaultNow(),
});

// Trainer's schedule settings (singleton)
// weeklyTemplate: { "1": { enabled: true, startHour: 8, endHour: 20 }, ..., "7": {...} }
// Mon=1, Sun=7 (ISO weekday). endHour is exclusive (so 20 means last open slot is 19:00).
export const trainerSettings = pgTable("trainer_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dayStartHour: integer("day_start_hour").notNull().default(8),
  dayEndHour: integer("day_end_hour").notNull().default(20),
  weeklyTemplate: text("weekly_template").notNull().default("{}"), // JSON string
  cancelDeadlineHours: integer("cancel_deadline_hours").notNull().default(3),
  bookingDeadlineHours: integer("booking_deadline_hours").notNull().default(1),
  defaultCapacity: integer("default_capacity").notNull().default(2),
  // Дополнительное напоминание ученикам перед тренировкой (общая настройка для всех).
  // null = выключено; 15|30|60|120 — минут до начала.
  reminderMinutes: integer("reminder_minutes"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Holidays — single-day shutdowns
export const holidays = pgTable("holidays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull().unique(), // YYYY-MM-DD
  name: text("name"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Recurring booking rules (e.g. "every Tuesday and Thursday at 18:00")
export const recurringBookings = pgTable("recurring_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => users.id),
  weekdays: integer("weekdays").array().notNull(), // ISO day numbers 1..7 (Mon=1, Sun=7)
  hour: integer("hour").notNull(), // 8..19
  startDate: text("start_date").notNull(), // YYYY-MM-DD inclusive
  endDate: text("end_date"), // YYYY-MM-DD inclusive, nullable = open-ended
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Bookings table
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => users.id),
  timeSlotId: varchar("time_slot_id").notNull().references(() => timeSlots.id),
  status: text("status").notNull().default("pending"), // "pending", "confirmed", "cancelled"
  bookedBy: varchar("booked_by").notNull().references(() => users.id), // who made the booking (student or trainer)
  notes: text("notes"), // trainer notes
  recurringBookingId: varchar("recurring_booking_id").references(() => recurringBookings.id), // if generated by a recurring rule
  // Attendance: null = not yet marked, "attended" | "late" | "excused" | "no_show"
  attendanceStatus: text("attendance_status"),
  attendanceNote: text("attendance_note"), // e.g. "ОРВИ, до 5 мая"
  attendanceMarkedAt: timestamp("attendance_marked_at"),
  // If attendance consumed a trainer subscription session, link is stored here
  consumedTrainerPaymentId: varchar("consumed_trainer_payment_id"),
  createdAt: timestamp("created_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
});

// Membership payments: ЧВ (monthly) or БВ (one-time)
export const membershipPayments = pgTable("membership_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => users.id),
  type: text("type").notNull(), // "monthly_cv" | "one_time_bv"
  month: text("month"), // YYYY-MM (only for monthly_cv) — derived from paidDate
  paidDate: text("paid_date"), // YYYY-MM-DD — фактическая дата оплаты ЧВ (только для monthly_cv)
  date: text("date"), // YYYY-MM-DD (only for one_time_bv)
  note: text("note"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Trainer payment subscriptions: разовая / неделя / месяц
export const trainerPayments = pgTable("trainer_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull().references(() => users.id),
  type: text("type").notNull(), // "single" | "weekly" | "monthly"
  totalSessions: integer("total_sessions").notNull(), // 1, 2..3, 8..13
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  status: text("status").notNull().default("active"), // "active" | "completed" | "cancelled"
  note: text("note"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Notification system for trainer confirmations
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // "booking_request", "booking_confirmed", "booking_cancelled"
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  relatedBookingId: varchar("related_booking_id").references(() => bookings.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLogin: true,
});

export const insertTimeSlotSchema = createInsertSchema(timeSlots).omit({
  id: true,
  createdAt: true,
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  confirmedAt: true,
  cancelledAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
});

export const insertUserConsentSchema = createInsertSchema(userConsents).omit({
  id: true,
  acceptedAt: true,
});

export const updateStudentProfileSchema = z.object({
  firstName: z.string().trim().min(1, "Укажите имя"),
  lastName: z.string().trim().min(1, "Укажите фамилию"),
  middleName: z.string().trim().nullable().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD"),
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

export const insertRecurringBookingSchema = createInsertSchema(recurringBookings).omit({
  id: true,
  createdAt: true,
});

export const insertHolidaySchema = createInsertSchema(holidays).omit({
  id: true,
  createdAt: true,
});

export const insertMembershipPaymentSchema = createInsertSchema(membershipPayments).omit({
  id: true,
  createdAt: true,
});

export const insertTrainerPaymentSchema = createInsertSchema(trainerPayments).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  status: true,
});

// Membership payment input from API
export const MEMBERSHIP_PAYMENT_TYPES = ["monthly_cv", "one_time_bv"] as const;
export type MembershipPaymentType = (typeof MEMBERSHIP_PAYMENT_TYPES)[number];

export const membershipPaymentInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("monthly_cv"),
    paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата оплаты должна быть в формате YYYY-MM-DD"),
    note: z.string().max(300).nullable().optional(),
  }),
  z.object({
    type: z.literal("one_time_bv"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD"),
    note: z.string().max(300).nullable().optional(),
  }),
]);

// Trainer payment subscription input
export const TRAINER_PAYMENT_TYPES = ["single", "weekly", "monthly"] as const;
export type TrainerPaymentType = (typeof TRAINER_PAYMENT_TYPES)[number];

export const trainerPaymentInputSchema = z.object({
  type: z.enum(TRAINER_PAYMENT_TYPES),
  totalSessions: z.number().int().min(1).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(300).nullable().optional(),
}).refine(
  (d) => {
    if (d.type === "single") return d.totalSessions === 1;
    if (d.type === "weekly") return d.totalSessions >= 1 && d.totalSessions <= 7;
    if (d.type === "monthly") return d.totalSessions >= 1 && d.totalSessions <= 31;
    return true;
  },
  { message: "Количество тренировок не подходит под выбранный тип абонемента" },
);

// Per-weekday template entry validation
export const weekdayTemplateEntrySchema = z.object({
  enabled: z.boolean(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  breakStartHour: z.number().int().min(0).max(23).nullable().optional(),
  breakEndHour: z.number().int().min(1).max(24).nullable().optional(),
  capacity: z.number().int().min(1).max(50).nullable().optional(), // null/undefined => use defaultCapacity
}).refine(d => d.endHour > d.startHour, { message: "Час окончания должен быть позже часа начала" })
  .refine(
    (d) => {
      const hasStart = d.breakStartHour !== undefined && d.breakStartHour !== null;
      const hasEnd = d.breakEndHour !== undefined && d.breakEndHour !== null;
      return hasStart === hasEnd;
    },
    { message: "Начало и конец перерыва должны быть указаны вместе" },
  )
  .refine(
    (d) => {
      if (d.breakStartHour == null || d.breakEndHour == null) return true;
      return (
        d.breakEndHour > d.breakStartHour &&
        d.breakStartHour >= d.startHour &&
        d.breakEndHour <= d.endHour
      );
    },
    { message: "Перерыв должен быть внутри рабочих часов, конец позже начала" },
  );

export const weeklyTemplateSchema = z.record(
  z.enum(["1", "2", "3", "4", "5", "6", "7"]),
  weekdayTemplateEntrySchema,
);

export const trainerSettingsUpdateSchema = z.object({
  dayStartHour: z.number().int().min(0).max(23).optional(),
  dayEndHour: z.number().int().min(1).max(24).optional(),
  weeklyTemplate: weeklyTemplateSchema.optional(),
  // Hours before training when student can no longer cancel (0 = no restriction)
  cancelDeadlineHours: z.number().int().min(0).max(168).optional(),
  // Hours before training when student can no longer book (0 = no restriction)
  bookingDeadlineHours: z.number().int().min(0).max(168).optional(),
  // Default number of student spots per hour (used when weekday template doesn't override)
  defaultCapacity: z.number().int().min(1).max(50).optional(),
  // Дополнительное напоминание о тренировке (общая настройка). null = выключено.
  reminderMinutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]).nullable().optional(),
}).refine(
  (d) => d.dayStartHour === undefined || d.dayEndHour === undefined || d.dayEndHour > d.dayStartHour,
  { message: "Час окончания дня должен быть позже часа начала дня" },
);

export const slotCapacityUpdateSchema = z.object({
  capacity: z.number().int().min(1).max(50).nullable(), // null => reset to template/default
});

// Attendance
export const ATTENDANCE_STATUSES = ["attended", "late", "excused", "no_show"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendanceUpdateSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES).nullable(), // null => clear
  note: z.string().max(500).nullable().optional(),
});

export const sickLeaveUpdateSchema = z.object({
  sickUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), // null => recovered
  sickNote: z.string().max(500).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // when set: start auto-cancel from this date (default = today)
});

// Validation schemas
export const phoneVerificationSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Неверный формат номера телефона"),
  code: z.string().length(6, "Код подтверждения должен состоять из 6 цифр"),
});

export const studentRegistrationSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Неверный формат номера телефона"),
  firstName: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  lastName: z.string().min(2, "Фамилия должна содержать минимум 2 символа"),
});

export const trainerLoginSchema = z.object({
  phone: z.string(),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
});

export const bookingRequestSchema = z.object({
  timeSlotId: z.string(),
  notes: z.string().optional(),
});

// Inferred types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTimeSlot = z.infer<typeof insertTimeSlotSchema>;
export type TimeSlot = typeof timeSlots.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertUserConsent = z.infer<typeof insertUserConsentSchema>;
export type UserConsent = typeof userConsents.$inferSelect;
export type StudentWithConsents = User & { consents: (UserConsent & { document: Document })[] };
export type InsertRecurringBooking = z.infer<typeof insertRecurringBookingSchema>;
export type RecurringBooking = typeof recurringBookings.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type MembershipPayment = typeof membershipPayments.$inferSelect;
export type InsertMembershipPayment = z.infer<typeof insertMembershipPaymentSchema>;
export type MembershipPaymentInput = z.infer<typeof membershipPaymentInputSchema>;
export type TrainerPayment = typeof trainerPayments.$inferSelect;
export type InsertTrainerPayment = z.infer<typeof insertTrainerPaymentSchema>;
export type TrainerPaymentInput = z.infer<typeof trainerPaymentInputSchema>;
export type TrainerPaymentWithUsage = TrainerPayment & { usedSessions: number };
export type StudentPaymentStatus = {
  hasMembership: boolean; // ЧВ за текущий месяц или БВ на дату
  membershipKind: "monthly_cv" | "one_time_bv" | null;
  cvPaidDate: string | null; // YYYY-MM-DD — дата оплаты текущего ЧВ
  cvValidUntil: string | null; // YYYY-MM-DD — последний день действия текущего ЧВ (включительно)
  hasTrainerPayment: boolean; // есть активный абонемент с остатком
  activeTrainerPayment: TrainerPaymentWithUsage | null;
};
export type WeekdayTemplateEntry = z.infer<typeof weekdayTemplateEntrySchema>;
export type WeeklyTemplate = Partial<Record<"1" | "2" | "3" | "4" | "5" | "6" | "7", WeekdayTemplateEntry>>;
export type TrainerSettings = {
  id: string;
  dayStartHour: number;
  dayEndHour: number;
  weeklyTemplate: WeeklyTemplate;
  cancelDeadlineHours: number;
  bookingDeadlineHours: number;
  defaultCapacity: number;
  reminderMinutes: number | null;
  updatedAt: Date | null;
};
export type TrainerSettingsUpdate = z.infer<typeof trainerSettingsUpdateSchema>;
export type SlotCapacityUpdate = z.infer<typeof slotCapacityUpdateSchema>;

// Extended types for API responses
export type TimeSlotWithBookings = TimeSlot & {
  bookings: (Booking & { student: Pick<User, 'firstName' | 'lastName' | 'phone'> })[];
  availableSpots: number;
};

export type BookingWithDetails = Booking & {
  student: Pick<User, 'firstName' | 'lastName' | 'phone'>;
  timeSlot: TimeSlot;
};

export type DaySchedule = {
  date: string;
  timeSlots: TimeSlotWithBookings[];
};

// Phone verification types
export type PhoneVerification = z.infer<typeof phoneVerificationSchema>;
export type StudentRegistration = z.infer<typeof studentRegistrationSchema>;
export type TrainerLogin = z.infer<typeof trainerLoginSchema>;

// Broadcast log (in-memory only)
export type BroadcastLog = {
  id: string;
  title: string;
  message: string;
  recipientType: "all" | "date" | "specific";
  recipientCount: number;
  recipientIds: string[];
  date: string | null;
  sentAt: Date;
};
export type BookingRequest = z.infer<typeof bookingRequestSchema>;