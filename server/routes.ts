import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import type { User, Document } from "@shared/schema";
import { storage } from "./storage-instance";
import { setupWebSocket, broadcast, setRealtimeEnabled } from "./ws";
import { sendPushToUser, vapidPublicKey } from "./push";
import { pushNotifyUser } from "./push-notify-user";
import { 
  insertUserSchema, 
  insertBookingSchema, 
  phoneVerificationSchema,
  studentRegistrationSchema,
  trainerLoginSchema,
  bookingRequestSchema,
  updateStudentProfileSchema
} from "@shared/schema";
import { z } from "zod";
import {
  birthDateValidationError,
  calculateAgeYears,
} from "@shared/birth-date";
import {
  legalRepresentativeFieldsError,
  trimRepresentativeFields,
} from "@shared/legal-representative-fields";
import {
  appendBookingMessage,
  sanitizeBookingMessage,
} from "@shared/booking-message";
import { moscowDateString } from "./moscow-date";
import {
  filterRequiredDocuments,
  missingRequiredDocumentIds,
} from "@shared/consents-pricing";
import { documentInputSchema, trainerServiceInputSchema } from "@shared/schema";
import { sanitizeBlockNote } from "@shared/block-display";
import {
  MEMBERSHIP_BOOKING_BLOCK_MESSAGE,
  MEMBERSHIP_CANCEL_BLOCK_MESSAGE,
  MEMBERSHIP_RESCHEDULE_BLOCK_MESSAGE,
} from "@shared/membership-booking";
import {
  establishSession,
  destroySession,
  hashPassword,
  verifyPassword,
  upgradePasswordHashIfNeeded,
  toPublicUser,
  requireAuth,
  requireTrainer,
  requireSelfOrTrainer,
  sessionUserId,
  isSessionTrainer,
} from "./auth";

function normalizePhone(input: string): string | null {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) digits = "7" + digits;
  else if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length !== 11 || !digits.startsWith("7")) return null;
  return digits;
}

/** Parse "Фамилия Имя Отчество" from trainer contact fields. */
function parsePersonFullName(full: string): {
  firstName: string;
  lastName: string;
  middleName: string | null;
} | null {
  const parts = String(full || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
  if (parts.length < 2) return null;
  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.length > 2 ? parts.slice(2).join(" ") : null,
  };
}

function makeTemporaryPassword(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

async function recordConsents(userId: string, documentIds: string[] | undefined) {
  if (!documentIds || !Array.isArray(documentIds)) return;
  for (const docId of documentIds) {
    const doc = await storage.getDocument(docId);
    if (doc && doc.isActive) {
      await storage.recordConsent(userId, docId);
    }
  }
}

async function getSignedDocumentIds(userId: string): Promise<Set<string>> {
  const consents = await storage.getConsentsByUser(userId);
  return new Set(consents.map((c) => c.documentId));
}

async function getPendingRequiredDocuments(userId: string) {
  const activeDocs = await storage.getDocuments(true);
  const signed = await getSignedDocumentIds(userId);
  return filterRequiredDocuments(activeDocs).filter((d) => !signed.has(d.id));
}

async function assertRequiredConsentsForBooking(studentId: string): Promise<string | null> {
  const missing = await getPendingRequiredDocuments(studentId);
  if (missing.length === 0) return null;
  return `Примите обязательные документы: ${missing.map((d) => d.title).join(", ")}`;
}

async function notifyTrainerConsentRevoked(
  student: User,
  documentTitle: string,
): Promise<void> {
  const trainer = await storage.getTrainer();
  if (!trainer) return;
  const fullName = [student.lastName, student.firstName].filter(Boolean).join(" ");
  const message = `${fullName || "Ученик"} отозвал(а) согласие: «${documentTitle}»`;
  await storage.createNotification({
    userId: trainer.id,
    type: "consent_revoked",
    title: "Отозвано согласие",
    message,
    isRead: false,
    relatedBookingId: null,
    relatedUserId: student.id,
  } as any);
  broadcast({ type: "notification_update" });
  pushNotifyUser(trainer.id, "Отозвано согласие", message);
}

function sanitizeScheduleForPublic<T extends any>(schedule: T): T {
  const maskOneDay = (day: any) => ({
    ...day,
    timeSlots: (day?.timeSlots ?? []).map((slot: any) => ({
      ...slot,
      bookings: (slot?.bookings ?? []).map((booking: any) => ({
        ...booking,
        student: {
          ...(booking?.student ?? {}),
          firstName: "Ученик",
          lastName: "",
          phone: "",
        },
      })),
    })),
  });
  if (Array.isArray(schedule)) {
    return schedule.map(maskOneDay) as T;
  }
  return maskOneDay(schedule) as T;
}

function setScheduleCacheHeaders(_req: any, res: any) {
  res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
}

async function studentHasMembershipForDate(
  studentId: string,
  dateStr: string,
): Promise<boolean> {
  const status = await storage.getStudentPaymentStatus(studentId, dateStr);
  return status.membershipBookingAllowed;
}

/** Unique login phone for a child card (parent phone + suffix 01, 02, …). */
function syntheticChildPhone(parentPhone: string, index: number): string {
  const prefix = parentPhone.slice(0, 9);
  const suffix = String(index).padStart(2, "0");
  return prefix + suffix;
}

async function canActForStudent(req: any, studentId: string): Promise<boolean> {
  if (isSessionTrainer(req)) return true;
  const uid = sessionUserId(req);
  if (studentId === uid) {
    const me = await storage.getUser(uid);
    return me?.role === "student" || !!(me?.role === "parent" && me.isAlsoStudent);
  }
  const me = await storage.getUser(uid);
  if (me?.role === "parent" || me?.isParent) {
    return storage.isParentOfChild(uid, studentId);
  }
  return false;
}

/** User id may appear in recurring_bookings.student_id (students, trainer self, parent-athlete). */
function canHaveRecurringBookings(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "student") return true;
  if (user.role === "trainer") return true;
  if (user.role === "parent" && user.isAlsoStudent) return true;
  return false;
}

async function createChildUserForParent(
  parent: User,
  child: {
    firstName: string;
    lastName: string;
    middleName?: string | null;
    birthDate?: string | null;
    phone?: string | null;
  },
  childIndex: number,
  legalRepresentativeConfirmed: boolean,
): Promise<User> {
  const parentFullName = [parent.lastName, parent.firstName, parent.middleName].filter(Boolean).join(" ");
  let childPhone = child.phone ? normalizePhone(child.phone) : null;
  if (!childPhone) {
    let idx = childIndex;
    do {
      childPhone = syntheticChildPhone(parent.phone, idx);
      const taken = await storage.getUserByPhone(childPhone);
      if (!taken) break;
      idx += 1;
    } while (idx < 100);
  }
  if (!childPhone) {
    throw new Error("Не удалось создать уникальный телефон для ребёнка");
  }
  const existing = await storage.getUserByPhone(childPhone);
  if (existing) {
    if (existing.role !== "student") {
      throw new Error("Этот телефон уже занят другим аккаунтом");
    }
    const norm = (v?: string | null) => String(v || "").trim().toLowerCase();
    const samePerson =
      norm(existing.firstName) === norm(child.firstName) &&
      norm(existing.lastName) === norm(child.lastName) &&
      norm(existing.middleName) === norm(child.middleName ?? null) &&
      String(existing.birthDate || "") === String(child.birthDate || "");
    const linkedToParent = await storage.isParentOfChild(parent.id, existing.id);
    // Protect against accidental overwrite of another child card
    // when phone was copied from previous form values.
    if (!samePerson && !linkedToParent) {
      throw new Error("Телефон уже используется другой карточкой ребёнка. Очистите поле телефона или укажите другой номер.");
    }
    const updatedExisting = await storage.updateUser(existing.id, {
      firstName: String(child.firstName).trim(),
      lastName: String(child.lastName).trim(),
      middleName: child.middleName ? String(child.middleName).trim() : null,
      birthDate: child.birthDate || null,
      parentFullName,
      parentPhone: parent.phone,
      legalRepresentativeConfirmed,
      // If old card was archived, bring it back to active list.
      isActive: true,
      // New (or repeated) child registration always requires trainer approval.
      isPendingApproval: true,
    } as any);
    await storage.addParentChild({ parentId: parent.id, childId: existing.id });
    storage.getTrainer().then(async (trainer) => {
      if (!trainer) return;
      const fullName = [updatedExisting.lastName, updatedExisting.firstName].filter(Boolean).join(" ");
      const msg = `Добавлен ребёнок: ${fullName}`;
      await storage.createNotification({
        userId: trainer.id,
        type: "new_student",
        title: "Новый ученик",
        message: msg,
        isRead: false,
        relatedBookingId: null,
        relatedUserId: updatedExisting.id,
      } as any);
      broadcast({ type: "notification_update" });
      pushNotifyUser(trainer.id, "Новый ученик", msg);
    }).catch(() => {});
    return updatedExisting;
  }
  const childUser = await storage.createUser({
    phone: childPhone,
    firstName: String(child.firstName).trim(),
    lastName: String(child.lastName).trim(),
    middleName: child.middleName ? String(child.middleName).trim() : null,
    birthDate: child.birthDate || null,
    parentFullName,
    parentPhone: parent.phone,
    legalRepresentativeConfirmed,
    role: "student",
    isVerified: true,
    password: await hashPassword(randomUUID()),
    mustChangePassword: false,
    isPendingApproval: true,
    isAlsoStudent: false,
  } as any);
  await storage.addParentChild({ parentId: parent.id, childId: childUser.id });
  storage.getTrainer().then(async (trainer) => {
    if (!trainer) return;
    const fullName = [childUser.lastName, childUser.firstName].filter(Boolean).join(" ");
    const msg = `Новый ученик (ребёнок): ${fullName}`;
    await storage.createNotification({
      userId: trainer.id,
      type: "new_student",
      title: "Новый ученик",
      message: msg,
      isRead: false,
      relatedBookingId: null,
      relatedUserId: childUser.id,
    } as any);
    broadcast({ type: "notification_update" });
    pushNotifyUser(trainer.id, "Новый ученик", msg);
  }).catch(() => {});
  return childUser;
}

export async function registerRoutes(
  app: Express,
  options: { websocket?: boolean } = {},
): Promise<Server> {
  
  // Auth routes
  app.post("/api/auth/send-verification", async (req, res) => {
    try {
      const { phone } = req.body;
      
      // Generate 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // In a real app, send SMS here
      console.log(`SMS to ${phone}: Your verification code is ${verificationCode}`);
      
      // For demo, we'll store the code (in real app, use temporary storage)
      res.json({ success: true, message: "Код подтверждения отправлен", code: verificationCode });
    } catch (error) {
      res.status(500).json({ message: "Не удалось отправить код подтверждения" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const {
        phone,
        firstName,
        lastName,
        middleName,
        birthDate,
        password,
        parentFullName,
        parentPhone,
        consentDocumentIds,
      } = req.body;

      if (!firstName || !lastName) {
        return res.status(400).json({ message: "Заполните имя и фамилию" });
      }
      if (!password || String(password).length < 4) {
        return res.status(400).json({ message: "Пароль должен быть не короче 4 символов" });
      }
      const normalized = normalizePhone(phone);
      if (!normalized) {
        return res.status(400).json({ message: "Некорректный номер телефона" });
      }
      const existingUser = await storage.getUserByPhone(normalized);
      if (existingUser) {
        return res.status(400).json({ message: "Пользователь с таким телефоном уже существует" });
      }
      const duplicateFio = await storage.findStudentByFullName(
        String(firstName).trim(),
        String(lastName).trim(),
        middleName ? String(middleName).trim() : null,
      );
      if (duplicateFio) {
        return res.status(409).json({
          message: "Ученик с таким ФИО уже зарегистрирован. Войдите в существующий аккаунт или обратитесь к тренеру.",
        });
      }
      const duplicateLoose = await storage.findStudentByLastFirst(
        String(firstName).trim(),
        String(lastName).trim(),
      );
      if (duplicateLoose) {
        return res.status(409).json({
          message: "Ученик с такой фамилией и именем уже есть в списке. Найдите его у тренера или войдите в существующий аккаунт.",
        });
      }

      const birthErr = birthDateValidationError(birthDate, "student-self");
      if (birthErr) {
        return res.status(400).json({ message: birthErr });
      }

      // Check age and parent info (under 14 should not reach here — blocked above)
      const age = calculateAgeYears(birthDate);
      let normalizedParentPhone: string | null = null;
      if (age !== null && age < 14) {
        if (!parentFullName || !String(parentFullName).trim()) {
          return res.status(400).json({ message: "Для ученика младше 14 лет укажите ФИО законного представителя" });
        }
        const np = normalizePhone(parentPhone);
        if (!np) {
          return res.status(400).json({ message: "Укажите корректный телефон законного представителя" });
        }
        normalizedParentPhone = np;
      }

      const activeDocs = await storage.getDocuments(true);
      const accepted = new Set<string>(Array.isArray(consentDocumentIds) ? consentDocumentIds : []);
      const missingRequired = filterRequiredDocuments(activeDocs).filter((d) => !accepted.has(d.id));
      if (missingRequired.length > 0) {
        return res.status(400).json({
          message: `Необходимо принять документы: ${missingRequired.map((d) => d.title).join(", ")}`,
        });
      }

      const user = await storage.createUser({
        phone: normalized,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        middleName: middleName ? String(middleName).trim() : null,
        birthDate: birthDate || null,
        parentFullName: normalizedParentPhone ? String(parentFullName).trim() : null,
        parentPhone: normalizedParentPhone,
        role: "student",
        isVerified: true,
        password: await hashPassword(String(password)),
        mustChangePassword: false,
        isPendingApproval: true,
      } as any);

      await recordConsents(user.id, Array.from(accepted));
      await establishSession(req, user);

      // Notify trainer about new self-registered student
      storage.getTrainer().then(async (trainer) => {
        if (!trainer) return;
        const fullName = [user.lastName, user.firstName].filter(Boolean).join(" ");
        const msg = `Новый ученик зарегистрировался: ${fullName} (${user.phone})`;
        await storage.createNotification({
          userId: trainer.id,
          type: "new_student",
          title: "Новый ученик",
          message: msg,
          isRead: false,
          relatedBookingId: null,
          relatedUserId: user.id,
        } as any);
        broadcast({ type: "notification_update" });
        pushNotifyUser(trainer.id, "Новый ученик", msg);
      }).catch(() => {});

      res.status(201).json({
        user: toPublicUser(user),
      });
    } catch (error) {
      res.status(500).json({ message: "Не удалось зарегистрировать пользователя" });
    }
  });

  app.post("/api/auth/register-parent", async (req, res) => {
    try {
      const {
        phone,
        firstName,
        lastName,
        middleName,
        birthDate,
        password,
        isAlsoStudent,
        legalRepresentativeConfirmed,
        consentDocumentIds,
        children,
      } = req.body ?? {};

      if (!firstName || !lastName) {
        return res.status(400).json({ message: "Заполните имя и фамилию" });
      }
      if (!password || String(password).length < 4) {
        return res.status(400).json({ message: "Пароль должен быть не короче 4 символов" });
      }
      const normalized = normalizePhone(phone);
      if (!normalized) {
        return res.status(400).json({ message: "Некорректный номер телефона" });
      }
      const existingUser = await storage.getUserByPhone(normalized);
      if (existingUser) {
        return res.status(400).json({ message: "Пользователь с таким телефоном уже существует" });
      }

      const alsoStudent = !!isAlsoStudent;
      if (alsoStudent) {
        const adultBirthErr = birthDateValidationError(birthDate, "adult");
        if (adultBirthErr) {
          return res.status(400).json({ message: adultBirthErr });
        }
      }

      const childList = Array.isArray(children) ? children : [];
      if (childList.length === 0 && !alsoStudent) {
        return res.status(400).json({ message: "Добавьте хотя бы одного ребёнка" });
      }
      if (childList.length > 0 && legalRepresentativeConfirmed !== true) {
        return res.status(400).json({ message: "Подтвердите, что Вы — законный представитель ребёнка" });
      }

      const activeDocs = await storage.getDocuments(true);
      const accepted = new Set<string>(Array.isArray(consentDocumentIds) ? consentDocumentIds : []);
      const missingRequired = filterRequiredDocuments(activeDocs).filter((d) => !accepted.has(d.id));
      if (missingRequired.length > 0) {
        return res.status(400).json({
          message: `Необходимо принять документы: ${missingRequired.map((d) => d.title).join(", ")}`,
        });
      }

      const parent = await storage.createUser({
        phone: normalized,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        middleName: middleName ? String(middleName).trim() : null,
        birthDate: alsoStudent ? (birthDate || null) : null,
        role: "parent",
        isParent: true,
        isAlsoStudent: alsoStudent,
        isVerified: true,
        password: await hashPassword(String(password)),
        mustChangePassword: false,
        isPendingApproval: alsoStudent,
      } as any);

      await recordConsents(parent.id, Array.from(accepted));
      const createdChildren: User[] = [];
      for (let i = 0; i < childList.length; i++) {
        const c = childList[i];
        if (!c?.firstName || !c?.lastName) {
          return res.status(400).json({ message: `Заполните имя и фамилию ребёнка ${i + 1}` });
        }
        const childBirthErr = birthDateValidationError(c.birthDate, "child");
        if (childBirthErr) {
          return res.status(400).json({ message: `Ребёнок ${i + 1}: ${childBirthErr}` });
        }
        const childUser = await createChildUserForParent(
          parent,
          {
            firstName: c.firstName,
            lastName: c.lastName,
            middleName: c.middleName ?? null,
            birthDate: c.birthDate ?? null,
            phone: c.phone ?? null,
          },
          i + 1,
          true,
        );
        createdChildren.push(childUser);
        await recordConsents(childUser.id, Array.from(accepted));
      }

      await establishSession(req, parent);

      if (alsoStudent) {
        storage.getTrainer().then(async (trainer) => {
          if (!trainer) return;
          const fullName = [parent.lastName, parent.firstName].filter(Boolean).join(" ");
          const msg = `Родитель (тренируется): ${fullName} (${parent.phone})`;
          await storage.createNotification({
            userId: trainer.id,
            type: "new_student",
            title: "Новый ученик",
            message: msg,
            isRead: false,
            relatedBookingId: null,
            relatedUserId: parent.id,
          } as any);
          broadcast({ type: "notification_update" });
          pushNotifyUser(trainer.id, "Новый ученик", msg);
        }).catch(() => {});
      }

      res.status(201).json({
        user: toPublicUser(parent),
        children: createdChildren.map((c) => toPublicUser(c)),
      });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось зарегистрировать родителя" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { phone, password } = req.body;
      const normalized = normalizePhone(phone) || phone;
      const user = await storage.getUserByPhone(normalized);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      if (!password || !(await verifyPassword(password, user.password))) {
        return res.status(401).json({ message: "Неверный пароль" });
      }
      await upgradePasswordHashIfNeeded(
        async (id, hash) => {
          await storage.updateUser(id, { password: hash });
        },
        user.id,
        password,
        user.password,
      );
      await establishSession(req, user);

      // Trainer: no consent check needed
      if (user.role === "trainer") {
        await storage.updateUser(user.id, { lastLogin: new Date() });
        return res.json({
          user: {
            id: user.id,
            phone: user.phone,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
          },
          pendingDocuments: [],
        });
      }

      if (!user.isVerified) {
        return res.status(400).json({ message: "Пользователь не подтверждён" });
      }

      await storage.updateUser(user.id, { lastLogin: new Date() });

      const pendingDocuments = await getPendingRequiredDocuments(user.id);

      const showWelcomeMessage = !user.isPendingApproval && !user.welcomeShown;

      res.json({
        user: {
          ...toPublicUser(user),
          isPendingApproval: user.isPendingApproval,
        },
        pendingDocuments,
        showWelcomeMessage,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка входа" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(sessionUserId(req));
      if (!user) {
        await destroySession(req);
        return res.status(401).json({ message: "Сессия недействительна" });
      }
      if (user.role === "trainer") {
        return res.json({
          user: toPublicUser(user),
          pendingDocuments: [],
        });
      }
      const pendingDocuments = await getPendingRequiredDocuments(user.id);
      res.json({
        user: toPublicUser(user),
        pendingDocuments,
      });
    } catch {
      res.status(500).json({ message: "Не удалось проверить сессию" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      await destroySession(req);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Не удалось выйти" });
    }
  });

  app.post("/api/users/:id/mark-welcome-shown", requireAuth, requireSelfOrTrainer("id"), async (req, res) => {
    try {
      await storage.markWelcomeShown(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Ошибка" });
    }
  });

  app.post("/api/auth/sign-consents", requireAuth, async (req, res) => {
    try {
      const userId = sessionUserId(req);
      const { documentIds } = req.body;
      if (!Array.isArray(documentIds)) {
        return res.status(400).json({ message: "Неверный запрос" });
      }
      await recordConsents(userId, documentIds);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка записи согласий" });
    }
  });

  app.post("/api/auth/trainer-login", async (req, res) => {
    try {
      const { phone, password } = req.body;
      const normalized = normalizePhone(phone) || phone;
      const user = await storage.getUserByPhone(normalized);
      if (!user || user.role !== "trainer") {
        return res.status(401).json({ message: "Неверные данные тренера" });
      }
      if (!password || !(await verifyPassword(password, user.password))) {
        return res.status(401).json({ message: "Неверный пароль" });
      }
      await upgradePasswordHashIfNeeded(
        async (id, hash) => {
          await storage.updateUser(id, { password: hash });
        },
        user.id,
        password,
        user.password,
      );
      await establishSession(req, user);

      await storage.updateUser(user.id, { lastLogin: new Date() });

      res.json({
        user: {
          id: user.id,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка входа тренера" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const userId = sessionUserId(req);
      const { oldPassword, newPassword } = req.body;
      if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ message: "Новый пароль должен быть не короче 4 символов" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      if (!oldPassword || !(await verifyPassword(oldPassword, user.password))) {
        return res.status(401).json({ message: "Неверный текущий пароль" });
      }
      await storage.updateUser(userId, {
        password: await hashPassword(newPassword),
        mustChangePassword: false,
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Не удалось сменить пароль" });
    }
  });

  app.patch("/api/trainer/profile", requireTrainer, async (req, res) => {
    try {
      const userId = sessionUserId(req);
      const { phone, exemptMembership, exemptTrainerPayment } = req.body;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      if (user.role !== "trainer") return res.status(403).json({ message: "Доступ только для тренера" });

      const profileUpdates: Record<string, unknown> = {};
      if (exemptMembership !== undefined) profileUpdates.exemptMembership = !!exemptMembership;
      if (exemptTrainerPayment !== undefined) profileUpdates.exemptTrainerPayment = !!exemptTrainerPayment;
      if (Object.keys(profileUpdates).length > 0) {
        const updated = await storage.updateUser(userId, profileUpdates);
        const { password: _pw, ...safeUser } = updated as any;
        return res.json({ user: safeUser });
      }

      if (phone !== undefined) {
        // Validate phone format
        let digits = String(phone || "").replace(/\D/g, "");
        if (digits.length === 10) digits = "7" + digits;
        else if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
        if (digits.length !== 11 || !digits.startsWith("7")) {
          return res.status(400).json({ message: "Некорректный номер телефона" });
        }
        // Check uniqueness
        const existing = await storage.getUserByPhone(digits);
        if (existing && existing.id !== userId) {
          return res.status(409).json({ message: "Этот номер уже используется другим пользователем" });
        }
        const updated = await storage.updateUser(userId, { phone: digits });
        const { password: _pw, ...safeUser } = updated as any;
        return res.json({ user: safeUser });
      }

      const { password: _pw, ...safeUser } = user as any;
      res.json({ user: safeUser });
    } catch (error) {
      res.status(500).json({ message: "Не удалось обновить профиль" });
    }
  });

  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const targetId = req.params.id;
      if (
        !isSessionTrainer(req) &&
        targetId !== sessionUserId(req) &&
        !(await storage.isParentOfChild(sessionUserId(req), targetId))
      ) {
        return res.status(403).json({ message: "Нет доступа" });
      }
      const user = await storage.getUser(targetId);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      res.json({ user: toPublicUser(user) });
    } catch {
      res.status(500).json({ message: "Не удалось получить данные пользователя" });
    }
  });

  app.get("/api/users/:id/account-summary", requireAuth, async (req, res) => {
    try {
      const targetId = req.params.id;
      if (
        !isSessionTrainer(req) &&
        targetId !== sessionUserId(req) &&
        !(await storage.isParentOfChild(sessionUserId(req), targetId))
      ) {
        return res.status(403).json({ message: "Нет доступа" });
      }
      const summary = await storage.getStudentAccountSummary(targetId, moscowDateString());
      if (!summary) return res.status(404).json({ message: "Пользователь не найден" });
      const activeDocs = await storage.getDocuments(true);
      const signed = new Set(summary.signedDocumentIds);
      res.json({
        ...summary,
        documents: activeDocs.map((d) => ({
          ...d,
          accepted: signed.has(d.id),
        })),
      });
    } catch {
      res.status(500).json({ message: "Не удалось загрузить данные профиля" });
    }
  });

  app.patch("/api/users/:id/selected-service", requireAuth, async (req, res) => {
    try {
      const targetId = req.params.id;
      if (
        !isSessionTrainer(req) &&
        targetId !== sessionUserId(req) &&
        !(await storage.isParentOfChild(sessionUserId(req), targetId))
      ) {
        return res.status(403).json({ message: "Нет доступа" });
      }
      const { serviceId } = req.body ?? {};
      if (!serviceId || typeof serviceId !== "string") {
        return res.status(400).json({ message: "Укажите serviceId" });
      }
      const service = await storage.getTrainerService(serviceId);
      if (!service || !service.isActive) {
        return res.status(400).json({ message: "Услуга не найдена или недоступна" });
      }
      const user = await storage.updateUser(targetId, { selectedServiceId: serviceId } as any);
      res.json({ user: toPublicUser(user) });
    } catch {
      res.status(500).json({ message: "Не удалось сохранить услугу" });
    }
  });

  app.post("/api/users/:id/consents/toggle", requireAuth, async (req, res) => {
    try {
      const targetId = req.params.id;
      if (
        !isSessionTrainer(req) &&
        targetId !== sessionUserId(req) &&
        !(await storage.isParentOfChild(sessionUserId(req), targetId))
      ) {
        return res.status(403).json({ message: "Нет доступа" });
      }
      const { documentId, accepted } = req.body ?? {};
      if (!documentId || typeof accepted !== "boolean") {
        return res.status(400).json({ message: "Укажите documentId и accepted" });
      }
      const doc = await storage.getDocument(documentId);
      if (!doc || !doc.isActive) {
        return res.status(404).json({ message: "Документ не найден" });
      }
      const student = await storage.getUser(targetId);
      if (!student) return res.status(404).json({ message: "Пользователь не найден" });

      if (accepted) {
        await storage.recordConsent(targetId, documentId);
      } else {
        const had = await storage.revokeConsent(targetId, documentId);
        if (!had) return res.status(400).json({ message: "Согласие не было принято" });
        if (!isSessionTrainer(req)) {
          await notifyTrainerConsentRevoked(student, doc.title);
        }
      }

      const summary = await storage.getStudentAccountSummary(targetId, moscowDateString());
      const activeDocs = await storage.getDocuments(true);
      const signed = new Set(summary?.signedDocumentIds ?? []);
      res.json({
        accountSummary: summary,
        documents: activeDocs.map((d) => ({ ...d, accepted: signed.has(d.id) })),
      });
    } catch {
      res.status(500).json({ message: "Не удалось обновить согласие" });
    }
  });

  app.patch("/api/users/me", requireAuth, async (req, res) => {
    try {
      const userId = sessionUserId(req);
      const { userId: _ignored, ...payload } = req.body ?? {};
      // Block profile editing for pending students
      const currentUserRecord = await storage.getUser(userId);
      if (currentUserRecord?.isPendingApproval) {
        return res.status(403).json({ message: "Редактирование профиля доступно только после одобрения тренером." });
      }
      const parsed = updateStudentProfileSchema.safeParse(payload);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Некорректные данные" });
      }
      const user = await storage.updateUser(userId, parsed.data as any);
      res.json({ user });
      // Notify trainer about profile change (fire-and-forget)
      storage.getTrainer().then(async (trainer) => {
        if (!trainer) return;
        const name = [parsed.data.lastName, parsed.data.firstName].filter(Boolean).join(" ") || parsed.data.firstName;
        await storage.createNotification({
          userId: trainer.id,
          type: "profile_updated",
          title: "Ученик обновил профиль",
          message: `${name} внёс изменения в свой профиль`,
          isRead: false,
        });
        broadcast({ type: "notification_update" });
      }).catch(() => {});
    } catch {
      res.status(500).json({ message: "Не удалось обновить профиль" });
    }
  });

  // Parent routes
  const hasParentAccess = (user?: User) => !!user && (user.role === "parent" || user.isParent);
  const requireParent = async (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Требуется вход в систему" });
    }
    const me = await storage.getUser(req.session.userId);
    if (!hasParentAccess(me)) {
      return res.status(403).json({ message: "Доступ только для родителя" });
    }
    next();
  };

  app.patch("/api/parent/enable-mode", requireAuth, async (req, res) => {
    try {
      const me = await storage.getUser(sessionUserId(req));
      if (!me) return res.status(404).json({ message: "Пользователь не найден" });
      if (me.role === "trainer") {
        return res.status(403).json({ message: "Режим родителя недоступен для тренера" });
      }
      const { enabled } = req.body ?? {};
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "Укажите enabled (boolean)" });
      }
      if (!enabled) {
        const children = await storage.getChildrenByParent(me.id);
        if (children.length > 0) {
          return res.status(400).json({ message: "Сначала удалите или отвяжите детей" });
        }
      }
      const updated = await storage.updateUser(me.id, { isParent: enabled } as any);
      res.json({ user: toPublicUser(updated) });
    } catch {
      res.status(500).json({ message: "Не удалось обновить режим родителя" });
    }
  });

  app.get("/api/parent/children", requireAuth, requireParent, async (req, res) => {
    try {
      const children = await storage.getChildrenByParent(sessionUserId(req));
      res.json(children.map((c) => toPublicUser(c)));
    } catch {
      res.status(500).json({ message: "Не удалось получить список детей" });
    }
  });

  app.post("/api/parent/children", requireAuth, requireParent, async (req, res) => {
    try {
      const parent = await storage.getUser(sessionUserId(req));
      if (!parent) return res.status(404).json({ message: "Пользователь не найден" });
      const { firstName, lastName, middleName, birthDate, phone, legalRepresentativeConfirmed } = req.body ?? {};
      if (!firstName || !lastName) {
        return res.status(400).json({ message: "Заполните имя и фамилию ребёнка" });
      }
      if (legalRepresentativeConfirmed !== true) {
        return res.status(400).json({ message: "Подтвердите, что Вы — законный представитель ребёнка" });
      }
      const childBirthErr = birthDateValidationError(birthDate, "child");
      if (childBirthErr) {
        return res.status(400).json({ message: childBirthErr });
      }
      const existingChildren = await storage.getChildrenByParent(parent.id);
      const child = await createChildUserForParent(
        parent,
        { firstName, lastName, middleName, birthDate, phone },
        existingChildren.length + 1,
        legalRepresentativeConfirmed,
      );
      // Child inherits all already accepted parent consents.
      const parentConsents = await storage.getConsentsByUser(parent.id);
      const parentDocumentIds = Array.from(
        new Set(parentConsents.map((consent) => consent.documentId)),
      );
      await recordConsents(child.id, parentDocumentIds);
      res.status(201).json(toPublicUser(child));
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось добавить ребёнка" });
    }
  });

  app.patch("/api/parent/children/:id", requireAuth, requireParent, async (req, res) => {
    try {
      const parentId = sessionUserId(req);
      const childId = req.params.id;
      if (!(await storage.isParentOfChild(parentId, childId))) {
        return res.status(403).json({ message: "Этот ребёнок не привязан к вашему аккаунту" });
      }
      const child = await storage.getUser(childId);
      if (!child || child.role !== "student") {
        return res.status(404).json({ message: "Ребёнок не найден" });
      }
      const { firstName, lastName, middleName, birthDate, parentFullName, parentPhone } = req.body ?? {};
      const updates: Partial<User> = {};
      if (firstName !== undefined) updates.firstName = String(firstName).trim();
      if (lastName !== undefined) updates.lastName = String(lastName).trim();
      if (middleName !== undefined) updates.middleName = middleName ? String(middleName).trim() : null;
      if (birthDate !== undefined) {
        const childBirthErr = birthDateValidationError(birthDate, birthDate ? "child" : "optional");
        if (childBirthErr) {
          return res.status(400).json({ message: childBirthErr });
        }
        updates.birthDate = birthDate || null;
      }
      if (parentFullName !== undefined) updates.parentFullName = parentFullName ? String(parentFullName).trim() : null;
      if (parentPhone !== undefined) {
        const np = parentPhone ? normalizePhone(parentPhone) : null;
        updates.parentPhone = np;
      }
      const updated = await storage.updateUser(childId, updates);
      res.json(toPublicUser(updated));
    } catch {
      res.status(500).json({ message: "Не удалось обновить данные ребёнка" });
    }
  });

  app.patch("/api/parent/enable-self-booking", requireAuth, requireParent, async (req, res) => {
    try {
      const parentId = sessionUserId(req);
      const { enabled } = req.body ?? {};
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "Укажите enabled (boolean)" });
      }
      const currentParent = await storage.getUser(parentId);
      if (!currentParent) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      const updated = await storage.updateUser(parentId, {
        isAlsoStudent: enabled,
        isPendingApproval: enabled ? true : false,
      } as any);
      // Notify trainer when parent submits a new self-training request.
      if (enabled && !currentParent.isAlsoStudent) {
        const trainer = await storage.getTrainer();
        if (trainer) {
          const fullName = [updated.lastName, updated.firstName].filter(Boolean).join(" ");
          const message = `${fullName || "Родитель"} подал(а) заявку «Хочу тренироваться»`;
          await storage.createNotification({
            userId: trainer.id,
            type: "new_student",
            title: "Новая заявка",
            message,
            isRead: false,
            relatedBookingId: null,
            relatedUserId: updated.id,
          } as any);
          broadcast({ type: "notification_update" });
          pushNotifyUser(trainer.id, "Новая заявка", message);
        }
      }
      res.json({ user: toPublicUser(updated) });
    } catch {
      res.status(500).json({ message: "Не удалось обновить настройку" });
    }
  });

  // Schedule routes (public read)

  app.get("/api/schedule/day/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const schedule = await storage.getScheduleForDate(date);
      setScheduleCacheHeaders(req, res);
      if (!req.session?.userId) {
        return res.json(sanitizeScheduleForPublic(schedule));
      }
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить расписание дня" });
    }
  });

  app.get("/api/schedule/week/:startDate", async (req, res) => {
    try {
      const { startDate } = req.params;
      const end = new Date(startDate + "T00:00:00");
      end.setDate(end.getDate() + 6);
      const schedule = await storage.getScheduleForWeek(startDate);
      setScheduleCacheHeaders(req, res);
      if (!req.session?.userId) {
        return res.json(sanitizeScheduleForPublic(schedule));
      }
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить расписание недели" });
    }
  });

  app.get("/api/schedule/month/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const lastDay = new Date(parseInt(year), parseInt(month), 0);
      const schedule = await storage.getScheduleSummaryForMonth(parseInt(year), parseInt(month));
      setScheduleCacheHeaders(req, res);
      if (!req.session?.userId) {
        return res.json(sanitizeScheduleForPublic(schedule));
      }
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить расписание месяца" });
    }
  });

  // Booking routes
  app.use("/api/bookings", requireAuth);

  app.post("/api/bookings", async (req, res) => {
    try {
      const { timeSlotId, notes } = req.body;
      let studentId: string | undefined;
      let bookedBy: string;

      if (isSessionTrainer(req)) {
        studentId = req.body?.studentId;
        bookedBy = (req.body?.bookedBy as string) || sessionUserId(req);
      } else {
        bookedBy = sessionUserId(req);
        const me = await storage.getUser(sessionUserId(req));
        const requested = req.body?.studentId as string | undefined;
        if (requested) {
          if (!(await canActForStudent(req, requested))) {
            return res.status(403).json({ message: "Нет доступа" });
          }
          studentId = requested;
        } else if (me?.role === "parent") {
          if (me.isAlsoStudent) {
            studentId = me.id;
          } else {
            return res.status(400).json({ message: "Выберите ребёнка для записи" });
          }
        } else {
          studentId = sessionUserId(req);
        }
      }

      if (!studentId) {
        return res.status(400).json({ message: "Не указан ученик" });
      }

      // Get the target time slot to know its date
      const targetSlot = await storage.getTimeSlotById(timeSlotId);
      if (!targetSlot) {
        return res.status(404).json({ message: "Слот не найден" });
      }

      // Check if student already has an active booking on this date
      const studentBookings = await storage.getBookingsByStudent(studentId);
      const alreadyBooked = studentBookings.find(b => {
        if (b.status === "cancelled") return false;
        return b.timeSlot.date === targetSlot.date;
      });
      if (alreadyBooked) {
        return res.status(400).json({
          message: `Вы уже записаны на ${alreadyBooked.timeSlot.time}. На один день можно записаться только один раз.`
        });
      }

      // Block booking if student is pending trainer approval
      const bookingStudent = await storage.getUser(studentId);
      if (bookingStudent?.isPendingApproval) {
        return res.status(403).json({ message: "Ваша регистрация ещё не одобрена тренером. Ожидайте подтверждения." });
      }

      const consentBlock = await assertRequiredConsentsForBooking(studentId);
      if (consentBlock) {
        return res.status(403).json({ message: consentBlock });
      }

      if (!isSessionTrainer(req)) {
        const payStatus = await storage.getStudentPaymentStatus(studentId, targetSlot.date);
        if (!payStatus.membershipBookingAllowed) {
          return res.status(403).json({
            message: MEMBERSHIP_BOOKING_BLOCK_MESSAGE,
          });
        }
      }

      // Check if time slot is available
      const existingBookings = await storage.getBookingsByTimeSlot(timeSlotId);
      const confirmedBookings = existingBookings.filter(b => b.status === "confirmed");
      
      if (confirmedBookings.length >= 2) {
        return res.status(400).json({ message: "Все места в этом слоте заняты" });
      }

      // Enforce booking deadline (student-self-booking only)
      const settings = await storage.getTrainerSettings();
      if (settings.bookingDeadlineHours > 0) {
        const startIso = `${targetSlot.date}T${targetSlot.time.slice(0, 5)}:00+03:00`;
        const minutesUntil = Math.round(
          (new Date(startIso).getTime() - Date.now()) / 60_000
        );
        if (minutesUntil <= settings.bookingDeadlineHours * 60) {
          const h = settings.bookingDeadlineHours;
          return res.status(400).json({
            message: `Запись закрыта менее чем за ${h} ${h === 1 ? "час" : "ч."} до тренировки`,
          });
        }
      }
      
      const booking = await storage.createBooking({
        studentId,
        timeSlotId,
        bookedBy,
        status: "pending",
        notes: notes || null
      });
      
      // Create notification for trainer
      const trainer = await storage.getTrainer();
      if (trainer) {
        const studentName = (await storage.getUser(studentId))?.firstName ?? "Ученик";
        const slot = await storage.getTimeSlotById(timeSlotId);
        const formatDate = (iso: string) => {
          const [y, m, d] = iso.split("-");
          return `${d}-${m}-${y}`;
        };
        const when = slot
          ? `${formatDate(slot.date)} в ${slot.time.slice(0, 5)}`
          : "выбранное время";
        await storage.createNotification({
          userId: trainer.id,
          type: "booking_request",
          title: "Новая заявка на запись",
          message: `${studentName} хочет записаться: ${when}`,
          relatedBookingId: booking.id
        });
        pushNotifyUser(trainer.id, "Новая заявка на запись", `${studentName} хочет записаться: ${when}`);
      }
      
      const bookingWithDetails = await storage.getBooking(booking.id);
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.status(201).json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Не удалось создать запись" });
    }
  });

  app.put("/api/bookings/:id/confirm", requireTrainer, async (req, res) => {
    try {
      const { id } = req.params;
      const booking = await storage.confirmBooking(id);

      // Mark any pending booking_request notifications for this booking as read
      await storage.markBookingNotificationsAsRead(booking.id);
      
      // Create notification for student
      await storage.createNotification({
        userId: booking.studentId,
        type: "booking_confirmed",
        title: "Запись подтверждена",
        message: "Ваша запись на тренировку подтверждена тренером",
        relatedBookingId: booking.id
      });
      pushNotifyUser(booking.studentId, "Запись подтверждена", "Ваша запись на тренировку подтверждена тренером");
      
      const bookingWithDetails = await storage.getBooking(booking.id);
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Не удалось подтвердить запись" });
    }
  });

  app.put("/api/bookings/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      const cancelledBy =
        (req.body?.cancelledBy as string | undefined) ?? sessionUserId(req);
      const studentMessage = sanitizeBookingMessage(req.body?.message);

      const existing = await storage.getBooking(id);
      if (!existing) {
        return res.status(404).json({ message: "Запись не найдена" });
      }

      if (!isSessionTrainer(req) && cancelledBy !== sessionUserId(req)) {
        const canCancelChild = await storage.isParentOfChild(
          sessionUserId(req),
          existing.studentId,
        );
        if (!canCancelChild) {
          return res.status(403).json({ message: "Нет доступа" });
        }
      }

      // Enforce cancel deadline only for student-self-cancellations
      const canceller = cancelledBy ? await storage.getUser(cancelledBy) : null;
      const cancelledByStudent =
        !!canceller &&
        (canceller.role === "student" ||
          (canceller.role === "parent" && canceller.isAlsoStudent)) &&
        canceller.id === existing.studentId;
      const cancelledByParentForChild =
        !!canceller &&
        canceller.role === "parent" &&
        canceller.id !== existing.studentId &&
        (await storage.isParentOfChild(canceller.id, existing.studentId));

      if (cancelledByStudent || cancelledByParentForChild) {
        if (!(await studentHasMembershipForDate(existing.studentId, existing.timeSlot.date))) {
          return res.status(403).json({ message: MEMBERSHIP_CANCEL_BLOCK_MESSAGE });
        }
        const settings = await storage.getTrainerSettings();
        if (settings.cancelDeadlineHours > 0) {
          const startIso = `${existing.timeSlot.date}T${existing.timeSlot.time.slice(0, 5)}:00+03:00`;
          const minutesUntil = Math.round(
            (new Date(startIso).getTime() - Date.now()) / 60_000
          );
          if (minutesUntil <= settings.cancelDeadlineHours * 60) {
            const h = settings.cancelDeadlineHours;
            return res.status(400).json({
              message: `Отмена записи закрыта менее чем за ${h} ${h === 1 ? "час" : "ч."} до тренировки. Свяжитесь с тренером.`,
            });
          }
        }
      }

      const booking = await storage.cancelBooking(id);

      // Mark any pending booking_request notifications for this booking as read
      await storage.markBookingNotificationsAsRead(booking.id);

      const slot = await storage.getTimeSlotById(booking.timeSlotId);
      const when = slot
        ? (() => {
            const [y, m, d] = slot.date.split("-");
            return `${d}-${m}-${y} в ${slot.time}`;
          })()
        : "тренировку";

      if (cancelledByStudent || cancelledByParentForChild) {
        // Student or parent cancelled → notify the trainer
        const trainer = await storage.getTrainer();
        if (trainer) {
          const bookedStudent = await storage.getUser(booking.studentId);
          const studentName = bookedStudent?.firstName ?? canceller?.firstName ?? "Ученик";
          const studentLast = bookedStudent?.lastName
            ? ` ${bookedStudent.lastName}`
            : canceller?.lastName
              ? ` ${canceller.lastName}`
              : "";
          const cancelTitle = cancelledByParentForChild
            ? "Родитель отменил запись"
            : "Ученик отменил запись";
          const cancelMessage = appendBookingMessage(
            `${studentName}${studentLast} отменил(а) запись: ${when}`,
            studentMessage,
          );
          await storage.createNotification({
            userId: trainer.id,
            type: "booking_cancelled",
            title: cancelTitle,
            message: cancelMessage,
            relatedBookingId: booking.id,
          });
          pushNotifyUser(trainer.id, cancelTitle, cancelMessage);
        }
      } else {
        // Trainer (or system) cancelled → notify the student
        await storage.createNotification({
          userId: booking.studentId,
          type: "booking_cancelled",
          title: "Запись отменена",
          message: `Ваша запись (${when}) отменена тренером`,
          relatedBookingId: booking.id,
        });
        pushNotifyUser(booking.studentId, "Запись отменена", `Ваша запись (${when}) отменена тренером`);
      }

      const bookingWithDetails = await storage.getBooking(booking.id);
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Не удалось отменить запись" });
    }
  });

  app.post("/api/bookings/:id/reschedule", async (req, res) => {
    try {
      const { id } = req.params;
      const { newTimeSlotId, rescheduledBy: rescheduledByBody, message: messageBody } = req.body ?? {};
      if (!newTimeSlotId) return res.status(400).json({ message: "Укажите новый слот" });
      const studentMessage = sanitizeBookingMessage(messageBody);

      const booking = await storage.getRawBooking(id);
      if (!booking) return res.status(404).json({ message: "Запись не найдена" });
      if (booking.status === "cancelled") return res.status(400).json({ message: "Нельзя перенести отменённую запись" });

      const rescheduledBy =
        (rescheduledByBody as string | undefined) ?? sessionUserId(req);
      if (!isSessionTrainer(req) && rescheduledBy !== sessionUserId(req)) {
        const canReschedule =
          booking.studentId === sessionUserId(req) ||
          (await storage.isParentOfChild(sessionUserId(req), booking.studentId));
        if (!canReschedule) {
          return res.status(403).json({ message: "Нет доступа" });
        }
      }

      // Determine role of the person rescheduling
      const rescheduler = rescheduledBy ? await storage.getUser(rescheduledBy) : null;
      const byRole: "trainer" | "student" = rescheduler?.role === "trainer" ? "trainer" : "student";

      if (byRole === "student" && booking.studentId !== rescheduler?.id) {
        const parentReschedule =
          rescheduler?.role === "parent" &&
          (await storage.isParentOfChild(rescheduler.id, booking.studentId));
        if (!parentReschedule) {
          return res.status(403).json({ message: "Нет доступа" });
        }
      }

      // Enforce cancel deadline for students
      if (byRole === "student") {
        const oldSlotRaw = await storage.getTimeSlotById(booking.timeSlotId);
        if (oldSlotRaw && !(await studentHasMembershipForDate(booking.studentId, oldSlotRaw.date))) {
          return res.status(403).json({ message: MEMBERSHIP_RESCHEDULE_BLOCK_MESSAGE });
        }
        const settings = await storage.getTrainerSettings();
        if (oldSlotRaw && settings.cancelDeadlineHours > 0) {
          const slotMs = new Date(`${oldSlotRaw.date}T${oldSlotRaw.time.slice(0,5)}:00+03:00`).getTime();
          const minutesUntil = Math.round((slotMs - Date.now()) / 60_000);
          if (minutesUntil <= settings.cancelDeadlineHours * 60) {
            return res.status(400).json({ message: `Перенос недоступен менее чем за ${settings.cancelDeadlineHours} ч. до тренировки` });
          }
        }
      }

      const oldSlot = await storage.getTimeSlotById(booking.timeSlotId);
      const rescheduled = await storage.rescheduleBooking(id, newTimeSlotId, byRole);
      const newSlot = await storage.getTimeSlotById(newTimeSlotId);

      const fmtSlot = (s: { date: string; time: string } | undefined) =>
        s ? `${s.date.split("-").reverse().join(".")} в ${s.time.slice(0, 5)}` : "—";

      if (byRole === "trainer") {
        // Notify student about reschedule
        await storage.createNotification({
          userId: booking.studentId,
          type: "booking_confirmed",
          title: "Тренировка перенесена",
          message: `Тренер перенёс вашу тренировку: ${fmtSlot(oldSlot)} → ${fmtSlot(newSlot)}`,
          relatedBookingId: rescheduled.id,
        });
      } else {
        // Notify trainer about student-initiated reschedule
        const trainer = await storage.getTrainer();
        const student = await storage.getUser(booking.studentId);
        if (trainer) {
          const name = student ? `${student.firstName} ${student.lastName ?? ""}`.trim() : "Ученик";
          const rescheduleTitle = "Ученик перенёс запись";
          const rescheduleMessage = appendBookingMessage(
            `${name} перенёс запись: ${fmtSlot(oldSlot)} → ${fmtSlot(newSlot)}${rescheduled.status === "pending" ? ". Требуется подтверждение." : ""}`,
            studentMessage,
          );
          await storage.createNotification({
            userId: trainer.id,
            type: "booking_request",
            title: rescheduleTitle,
            message: rescheduleMessage,
            relatedBookingId: rescheduled.id,
          });
          pushNotifyUser(trainer.id, rescheduleTitle, rescheduleMessage);
        }
      }

      const bookingWithDetails = await storage.getBooking(rescheduled.id);
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json(bookingWithDetails);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Не удалось перенести запись" });
    }
  });

  app.get("/api/bookings/student/:studentId", requireAuth, async (req, res) => {
    try {
      const { studentId } = req.params;
      if (!(await canActForStudent(req, studentId))) {
        return res.status(403).json({ message: "Нет доступа" });
      }
      const bookings = await storage.getBookingsByStudent(studentId);
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить записи ученика" });
    }
  });

  app.get("/api/services", async (_req, res) => {
    try {
      res.json(await storage.getTrainerServices(true));
    } catch {
      res.status(500).json({ message: "Не удалось получить услуги" });
    }
  });

  app.get("/api/documents", async (_req, res) => {
    try {
      res.json(await storage.getDocuments(true));
    } catch {
      res.status(500).json({ message: "Не удалось получить документы" });
    }
  });

  // Trainer routes
  app.use("/api/trainer", requireTrainer);

  app.get("/api/trainer/students", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const students = await storage.getStudentsList(includeInactive);
      const todayStr = moscowDateString();
      const studentsWithConsents = await Promise.all(
        students.map(async (student) => {
          const signed = await getSignedDocumentIds(student.id);
          const activeDocs = await storage.getDocuments(true);
          const pendingDocumentCount = missingRequiredDocumentIds(activeDocs, signed).length;
          let hasMembership = false;
          let hasTrainerPayment = false;
          try {
            const payStatus = await storage.getStudentPaymentStatus(student.id, todayStr);
            hasMembership = payStatus.hasMembership;
            hasTrainerPayment = payStatus.hasTrainerPayment;
          } catch (err) {
            console.error(
              `[students] payment status for ${student.id} (${student.lastName} ${student.firstName}):`,
              err,
            );
          }
          const hasLinkedChildren =
            student.role === "parent"
              ? (await storage.getChildrenByParent(student.id)).length > 0
              : false;
          return {
            ...student,
            pendingDocumentCount,
            hasMembership,
            hasTrainerPayment,
            hasLinkedChildren,
          };
        })
      );
      res.json(studentsWithConsents);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить список учеников" });
    }
  });

  app.patch("/api/trainer/students/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getUser(id);
      if (!existing) return res.status(404).json({ message: "Ученик не найден" });
      const wasPending = existing.isPendingApproval;
      const user = wasPending ? await storage.approveStudent(id) : existing;
      const trainerId = sessionUserId(req);
      await storage.markNewStudentNotificationsAsRead(trainerId, id);
      if (wasPending) {
        await storage.createNotification({
          userId: user.id,
          type: "registration_approved",
          title: "Регистрация одобрена",
          message: "Тренер одобрил вашу регистрацию. Теперь вы можете записываться на тренировки!",
          isRead: false,
          relatedBookingId: null,
        });
        pushNotifyUser(user.id, "Регистрация одобрена", "Тренер одобрил вашу регистрацию. Теперь вы можете записываться на тренировки!");
      }
      broadcast({ type: "notification_update" });
      broadcast({ type: "user_update", userId: user.id });
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось одобрить ученика" });
    }
  });

  app.patch("/api/trainer/students/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive, resetCv } = req.body as { isActive: boolean; resetCv?: boolean };
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "Укажите isActive (boolean)" });
      }
      const user = await storage.setUserActiveStatus(id, isActive, resetCv ?? false);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось изменить статус ученика" });
    }
  });

  app.post("/api/trainer/students/:id/reset-password", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "Ученик не найден" });
      if (user.role === "trainer") {
        return res.status(400).json({ message: "Нельзя сбросить пароль тренера здесь" });
      }
      const temporaryPassword = makeTemporaryPassword();
      await storage.updateUser(id, {
        password: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      });
      res.json({ temporaryPassword });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось сбросить пароль" });
    }
  });

  app.post("/api/trainer/students/:id/create-parent-access", async (req, res) => {
    try {
      const { id } = req.params;
      const which = req.body?.which === "father" ? "father" : "mother";
      const student = await storage.getUser(id);
      if (!student) return res.status(404).json({ message: "Ученик не найден" });
      if (student.role !== "student") {
        return res.status(400).json({ message: "Доступ родителю создаётся только для карточки ученика" });
      }

      const age = calculateAgeYears(student.birthDate);
      if (age === null) {
        return res.status(400).json({ message: "Укажите дату рождения ученика" });
      }
      if (age >= 14) {
        return res.status(400).json({
          message: "Создание доступа родителю доступно для учеников младше 14 лет",
        });
      }

      const fullName =
        which === "father" ? student.fatherFullName : student.motherFullName;
      const rawPhone = which === "father" ? student.fatherPhone : student.motherPhone;
      if (!fullName?.trim() || !rawPhone) {
        return res.status(400).json({
          message:
            which === "father"
              ? "Сначала заполните ФИО и телефон отца в карточке ученика"
              : "Сначала заполните ФИО и телефон матери в карточке ученика",
        });
      }

      const parsed = parsePersonFullName(fullName);
      if (!parsed) {
        return res.status(400).json({
          message: "Укажите полное ФИО родителя в формате «Фамилия Имя» (и отчество при наличии)",
        });
      }

      const phone = normalizePhone(rawPhone);
      if (!phone) {
        return res.status(400).json({ message: "Некорректный телефон родителя" });
      }
      if (phone === student.phone) {
        return res.status(400).json({
          message:
            "Телефон родителя совпадает с телефоном ученика. Укажите отдельный номер родителя.",
        });
      }

      const linkedParents = await storage.getParentsByChild(id);
      const alreadyLinked = linkedParents.find((p) => p.phone === phone);
      if (alreadyLinked) {
        const temporaryPassword = makeTemporaryPassword();
        await storage.updateUser(alreadyLinked.id, {
          password: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        });
        return res.json({
          created: false,
          alreadyLinked: true,
          parent: {
            id: alreadyLinked.id,
            phone: alreadyLinked.phone,
            firstName: alreadyLinked.firstName,
            lastName: alreadyLinked.lastName,
          },
          temporaryPassword,
        });
      }

      const existing = await storage.getUserByPhone(phone);
      let parent: User;
      let created = false;
      let temporaryPassword: string | null = null;

      if (existing) {
        if (existing.role === "trainer") {
          return res.status(400).json({ message: "Этот телефон принадлежит тренеру" });
        }
        if (existing.role === "student" && !existing.isParent) {
          return res.status(409).json({
            message:
              "Этот телефон уже занят аккаунтом ученика. Укажите другой номер родителя или попросите родителя зарегистрироваться сам.",
          });
        }
        // Existing parent (or student with parent mode): just link
        parent = existing;
        if (existing.role !== "parent" || !existing.isParent) {
          parent = await storage.updateUser(existing.id, {
            role: existing.role === "parent" ? "parent" : existing.role,
            isParent: true,
          } as any);
        }
        await storage.addParentChild({ parentId: parent.id, childId: id });
        temporaryPassword = makeTemporaryPassword();
        parent = await storage.updateUser(parent.id, {
          password: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        });
      } else {
        temporaryPassword = makeTemporaryPassword();
        parent = await storage.createUser({
          phone,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          middleName: parsed.middleName,
          birthDate: null,
          role: "parent",
          isParent: true,
          isAlsoStudent: false,
          isVerified: true,
          password: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          isPendingApproval: false,
          legalRepresentativeConfirmed: true,
        } as any);
        await storage.addParentChild({ parentId: parent.id, childId: id });
        created = true;
      }

      // Keep legacy single-parent fields in sync for display
      await storage.updateUser(id, {
        parentFullName: fullName.trim(),
        parentPhone: phone,
        legalRepresentativeConfirmed: true,
      } as any);

      res.json({
        created,
        alreadyLinked: false,
        parent: {
          id: parent.id,
          phone: parent.phone,
          firstName: parent.firstName,
          lastName: parent.lastName,
        },
        temporaryPassword,
      });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось создать доступ родителю" });
    }
  });

  app.get("/api/trainer/students/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const student = await storage.getStudentWithConsents(id);
      if (!student) return res.status(404).json({ message: "Ученик не найден" });
      const linkedParents = student.role === "student" ? await storage.getParentsByChild(id) : [];
      const parentWhoTrains = linkedParents.find((p) => p.isAlsoStudent);
      res.json({
        ...student,
        linkedParents: linkedParents.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          phone: p.phone,
        })),
        parentAlsoTrains: !!parentWhoTrains,
        parentAlsoTrainsName: parentWhoTrains
          ? [parentWhoTrains.lastName, parentWhoTrains.firstName].filter(Boolean).join(" ")
          : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить данные ученика" });
    }
  });

  app.patch("/api/trainer/students/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "Ученик не найден" });
      if (user.role === "trainer") return res.status(400).json({ message: "Нельзя редактировать тренера здесь" });

      const { phone, firstName, lastName, middleName, birthDate, trainerNotes, exemptMembership, exemptTrainerPayment,
        motherFullName, motherPhone, fatherFullName, fatherPhone,
      } = req.body;
      const updates: any = {};
      if (phone !== undefined) {
        const normalizedPhone = normalizePhone(String(phone));
        if (!normalizedPhone) {
          return res.status(400).json({ message: "Некорректный номер телефона" });
        }
        const existing = await storage.getUserByPhone(normalizedPhone);
        if (existing && existing.id !== id) {
          return res.status(409).json({ message: "Ученик с таким телефоном уже существует" });
        }
        updates.phone = normalizedPhone;
      }
      if (firstName !== undefined) updates.firstName = String(firstName).trim();
      if (lastName !== undefined) updates.lastName = lastName ? String(lastName).trim() : null;
      if (middleName !== undefined) updates.middleName = middleName ? String(middleName).trim() : null;
      let effectiveBirthDate = user.birthDate;
      if (birthDate !== undefined) {
        const birthErr = birthDateValidationError(birthDate, birthDate ? "optional" : "optional");
        if (birthErr) {
          return res.status(400).json({ message: birthErr });
        }
        updates.birthDate = birthDate || null;
        effectiveBirthDate = birthDate || null;
      }
      if (trainerNotes !== undefined) updates.trainerNotes = trainerNotes ? String(trainerNotes) : null;
      if (exemptMembership !== undefined) updates.exemptMembership = !!exemptMembership;
      if (exemptTrainerPayment !== undefined) updates.exemptTrainerPayment = !!exemptTrainerPayment;

      const repFieldsProvided =
        motherFullName !== undefined ||
        motherPhone !== undefined ||
        fatherFullName !== undefined ||
        fatherPhone !== undefined;
      if (repFieldsProvided) {
        const rep = trimRepresentativeFields({
          motherFullName: motherFullName !== undefined ? motherFullName : user.motherFullName,
          motherPhone: motherPhone !== undefined ? motherPhone : user.motherPhone,
          fatherFullName: fatherFullName !== undefined ? fatherFullName : user.fatherFullName,
          fatherPhone: fatherPhone !== undefined ? fatherPhone : user.fatherPhone,
        });
        const repErr = legalRepresentativeFieldsError(effectiveBirthDate, rep);
        if (repErr) {
          return res.status(400).json({ message: repErr });
        }
        updates.motherFullName = rep.motherFullName;
        updates.motherPhone = rep.motherPhone ? (normalizePhone(rep.motherPhone) ?? rep.motherPhone) : null;
        updates.fatherFullName = rep.fatherFullName;
        updates.fatherPhone = rep.fatherPhone ? (normalizePhone(rep.fatherPhone) ?? rep.fatherPhone) : null;
      } else if (birthDate !== undefined) {
        const repErr = legalRepresentativeFieldsError(effectiveBirthDate, {
          motherFullName: user.motherFullName,
          motherPhone: user.motherPhone,
          fatherFullName: user.fatherFullName,
          fatherPhone: user.fatherPhone,
        });
        if (repErr) {
          return res.status(400).json({ message: repErr });
        }
      }

      const updated = await storage.updateUser(id, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Не удалось обновить данные ученика" });
    }
  });

  app.post("/api/trainer/students", async (req, res) => {
    try {
      const {
        phone,
        firstName,
        lastName,
        middleName,
        birthDate,
        password,
        trainerNotes,
        consentDocumentIds,
        selectedServiceId,
        exemptMembership,
        exemptTrainerPayment,
        motherFullName,
        motherPhone,
        fatherFullName,
        fatherPhone,
      } = req.body;

      if (!phone || !firstName) {
        return res.status(400).json({ message: "Имя и телефон обязательны" });
      }
      const initialPassword = password && String(password).trim().length >= 4
        ? String(password).trim()
        : "12345";
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: "Некорректный номер телефона" });
      }
      const existing = await storage.getUserByPhone(normalizedPhone);
      if (existing) {
        return res.status(400).json({ message: "Ученик с таким телефоном уже существует" });
      }
      if (lastName) {
        const duplicateFio = await storage.findStudentByFullName(
          String(firstName).trim(),
          String(lastName).trim(),
          middleName ? String(middleName).trim() : null,
        );
        if (duplicateFio) {
          return res.status(409).json({ message: "Ученик с таким ФИО уже есть в списке" });
        }
      }

      if (birthDate) {
        const birthErr = birthDateValidationError(birthDate, "optional");
        if (birthErr) {
          return res.status(400).json({ message: birthErr });
        }
      }

      const rep = trimRepresentativeFields({
        motherFullName,
        motherPhone,
        fatherFullName,
        fatherPhone,
      });
      const repErr = legalRepresentativeFieldsError(birthDate || null, rep);
      if (repErr) {
        return res.status(400).json({ message: repErr });
      }

      const accepted = new Set<string>(Array.isArray(consentDocumentIds) ? consentDocumentIds : []);

      const user = await storage.createUser({
        phone: normalizedPhone,
        firstName: String(firstName).trim(),
        lastName: lastName ? String(lastName).trim() : null,
        middleName: middleName ? String(middleName).trim() : null,
        birthDate: birthDate || null,
        trainerNotes: trainerNotes ? String(trainerNotes) : null,
        parentFullName: null,
        parentPhone: null,
        motherFullName: rep.motherFullName,
        motherPhone: rep.motherPhone ? (normalizePhone(rep.motherPhone) ?? rep.motherPhone) : null,
        fatherFullName: rep.fatherFullName,
        fatherPhone: rep.fatherPhone ? (normalizePhone(rep.fatherPhone) ?? rep.fatherPhone) : null,
        legalRepresentativeConfirmed: false,
        role: "student",
        isVerified: true,
        password: await hashPassword(initialPassword),
        mustChangePassword: true,
        exemptMembership: !!exemptMembership,
        exemptTrainerPayment: !!exemptTrainerPayment,
      } as any);

      await recordConsents(user.id, Array.from(accepted));

      if (selectedServiceId && typeof selectedServiceId === "string") {
        const service = await storage.getTrainerService(selectedServiceId);
        if (service?.isActive) {
          await storage.updateUser(user.id, { selectedServiceId: service.id } as any);
        } else {
          await storage.assignDefaultServiceToUser(user.id);
        }
      } else {
        await storage.assignDefaultServiceToUser(user.id);
      }

      const refreshed = await storage.getUser(user.id);
      res.status(201).json(refreshed ?? user);
    } catch (error) {
      res.status(500).json({ message: "Не удалось добавить ученика" });
    }
  });

  // ----- Documents (consent forms) -----
  app.get("/api/trainer/documents", async (_req, res) => {
    try {
      const docs = await storage.getDocuments(false);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить документы" });
    }
  });

  app.post("/api/trainer/documents", async (req, res) => {
    try {
      const parsed = documentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Некорректные данные" });
      }
      const { title, content, isActive, kind, priceSurchargeRub } = parsed.data;
      if (kind === "pricing" && (priceSurchargeRub == null || priceSurchargeRub < 0)) {
        return res.status(400).json({ message: "Для ценового документа укажите надбавку (₽)" });
      }
      const doc = await storage.createDocument({
        title: title.trim(),
        content,
        isActive: isActive ?? true,
        kind: kind ?? "required",
        priceSurchargeRub: kind === "pricing" ? priceSurchargeRub ?? 0 : null,
      } as any);
      res.status(201).json(doc);
    } catch (error) {
      res.status(500).json({ message: "Не удалось создать документ" });
    }
  });

  app.patch("/api/trainer/documents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = documentInputSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Некорректные данные" });
      }
      const updates: Partial<Document> = {};
      const data = parsed.data;
      if (data.title !== undefined) updates.title = data.title.trim();
      if (data.content !== undefined) updates.content = data.content;
      if (data.isActive !== undefined) updates.isActive = data.isActive;
      if (data.kind !== undefined) updates.kind = data.kind;
      if (data.priceSurchargeRub !== undefined) updates.priceSurchargeRub = data.priceSurchargeRub;
      const doc = await storage.updateDocument(id, updates);
      res.json(doc);
    } catch (error) {
      res.status(500).json({ message: "Не удалось обновить документ" });
    }
  });

  app.get("/api/trainer/services", async (_req, res) => {
    try {
      res.json(await storage.getTrainerServices(false));
    } catch {
      res.status(500).json({ message: "Не удалось получить услуги" });
    }
  });

  app.post("/api/trainer/services", async (req, res) => {
    try {
      const parsed = trainerServiceInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Некорректные данные" });
      }
      const service = await storage.createTrainerService(parsed.data as any);
      res.status(201).json(service);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Не удалось создать услугу" });
    }
  });

  app.patch("/api/trainer/services/:id", async (req, res) => {
    try {
      const parsed = trainerServiceInputSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Некорректные данные" });
      }
      const service = await storage.updateTrainerService(req.params.id, parsed.data as any);
      res.json(service);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Не удалось обновить услугу" });
    }
  });

  app.delete("/api/trainer/services/:id", async (req, res) => {
    try {
      await storage.deleteTrainerService(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ message: e?.message || "Не удалось удалить услугу" });
    }
  });

  app.delete("/api/trainer/documents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteDocument(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Не удалось удалить документ" });
    }
  });

  app.delete("/api/trainer/students/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "Ученик не найден" });
      }
      if (user.role === "trainer") {
        return res.status(400).json({ message: "Нельзя удалить тренера" });
      }
      if (user.role === "parent") {
        const children = await storage.getChildrenByParent(user.id);
        if (children.length > 0) {
          return res.status(400).json({
            message: "Нельзя удалить родителя, к которому привязаны дети. Сначала удалите или отвяжите детей.",
          });
        }
      }
      const linkedParents = user.role === "student" ? await storage.getParentsByChild(user.id) : [];
      await storage.deleteUser(id);
      let deletedParentCount = 0;
      for (const parent of linkedParents) {
        const remainingChildren = await storage.getChildrenByParent(parent.id);
        if (remainingChildren.length === 0 && !parent.isAlsoStudent) {
          await storage.deleteUser(parent.id);
          deletedParentCount++;
        }
      }
      res.json({ success: true, deletedParentCount });
    } catch (error: any) {
      console.error("deleteUser error:", error?.message, error?.detail, error?.constraint);
      res.status(500).json({ message: "Не удалось удалить ученика", detail: error?.message });
    }
  });

  app.post("/api/trainer/book-student", async (req, res) => {
    try {
      const { timeSlotId, studentId, notes, trainerId } = req.body;

      const slot = await storage.getTimeSlotById(timeSlotId);
      if (!slot) return res.status(404).json({ message: "Слот не найден" });
      if (slot.isBlocked) return res.status(400).json({ message: "Слот заблокирован" });

      const slotBookings = await storage.getBookingsByTimeSlot(timeSlotId);
      const alreadyInSlot = slotBookings.some(
        (b) => b.studentId === studentId && b.status !== "cancelled",
      );
      if (alreadyInSlot) {
        return res.status(400).json({ message: "Ученик уже записан на это время" });
      }

      const dayBookings = await storage.getBookingsByStudent(studentId);
      const alreadyThatDay = dayBookings.find(
        (b) => b.status !== "cancelled" && b.timeSlot.date === slot.date,
      );
      if (alreadyThatDay) {
        return res.status(400).json({
          message: `Ученик уже записан на ${alreadyThatDay.timeSlot.time} в этот день`,
        });
      }

      const booking = await storage.createBooking({
        studentId,
        timeSlotId,
        bookedBy: trainerId,
        status: "confirmed", // Trainer bookings are automatically confirmed
        notes: notes || null
      });
      
      // Create notification for student
      await storage.createNotification({
        userId: studentId,
        type: "booking_confirmed",
        title: "Вас записал тренер",
        message: "Тренер записал вас на тренировку",
        relatedBookingId: booking.id
      });
      
      const bookingWithDetails = await storage.getBooking(booking.id);
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.status(201).json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Не удалось записать ученика" });
    }
  });

  app.post("/api/trainer/book-self", async (req, res) => {
    try {
      const trainerId = sessionUserId(req);
      const { timeSlotId } = req.body;
      if (!timeSlotId) {
        return res.status(400).json({ message: "Укажите слот" });
      }

      const slot = await storage.getTimeSlotById(timeSlotId);
      if (!slot) return res.status(404).json({ message: "Слот не найден" });
      if (slot.isBlocked) return res.status(400).json({ message: "Слот заблокирован" });

      const slotBookings = await storage.getBookingsByTimeSlot(timeSlotId);
      const alreadyInSlot = slotBookings.some(
        (b) => b.studentId === trainerId && b.status !== "cancelled",
      );
      if (alreadyInSlot) {
        return res.status(400).json({ message: "Вы уже записаны на это время" });
      }

      const dayBookings = await storage.getBookingsByStudent(trainerId);
      const alreadyThatDay = dayBookings.find(
        (b) => b.status !== "cancelled" && b.timeSlot.date === slot.date,
      );
      if (alreadyThatDay) {
        return res.status(400).json({
          message: `Вы уже записаны на ${alreadyThatDay.timeSlot.time} в этот день`,
        });
      }

      const booking = await storage.createBooking({
        studentId: trainerId,
        timeSlotId,
        bookedBy: trainerId,
        status: "confirmed",
        notes: null,
      });

      const bookingWithDetails = await storage.getBooking(booking.id);
      broadcast({ type: "schedule_update" });
      res.status(201).json(bookingWithDetails);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось записаться" });
    }
  });

  app.put("/api/trainer/time-slots/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const timeSlot = await storage.updateTimeSlot(id, updates);
      res.json(timeSlot);
    } catch (error) {
      res.status(500).json({ message: "Не удалось обновить слот" });
    }
  });

  // ----- Slot blocking (trainer vacation / sick days) -----
  async function notifyCancelled(cancelled: Array<{ studentId: string; id: string }>, reason: string) {
    for (const b of cancelled) {
      await storage.createNotification({
        userId: b.studentId,
        type: "booking_cancelled",
        title: "Запись отменена",
        message: reason,
        relatedBookingId: b.id,
      });
    }
  }

  app.patch("/api/trainer/time-slots/:id/capacity", async (req, res) => {
    try {
      const { id } = req.params;
      const { slotCapacityUpdateSchema } = await import("@shared/schema");
      const parsed = slotCapacityUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Неверная вместимость" });
      }
      const slot = await storage.updateSlotCapacity(id, parsed.data.capacity);
      res.json({ slot });
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Не удалось изменить количество мест" });
    }
  });

  app.patch("/api/trainer/time-slots/:id/block", async (req, res) => {
    try {
      const { id } = req.params;
      const { blocked, blockNote } = req.body;
      const note = blocked ? sanitizeBlockNote(blockNote) : null;
      const result = await storage.blockSlot(id, !!blocked, note);
      if (blocked) {
        const reason = note ? ` Причина: ${note}` : "";
        await notifyCancelled(
          result.cancelledBookings,
          `Тренер заблокировал это время. Запишитесь на другое.${reason}`,
        );
      }
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json({ slot: result.slot, cancelledCount: result.cancelledBookings.length });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось изменить слот" });
    }
  });

  app.post("/api/trainer/sync-recurring", requireTrainer, async (_req, res) => {
    try {
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 60);
      const horizonStr = horizon.toISOString().split("T")[0];
      const result = await storage.materializeRecurringBookings(horizonStr);
      broadcast({ type: "schedule_update" });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось синхронизировать постоянные записи" });
    }
  });

  app.post("/api/trainer/block-day", async (req, res) => {
    try {
      const { date, blocked, blockNote } = req.body;
      if (!date) return res.status(400).json({ message: "Укажите дату" });
      const note = blocked ? sanitizeBlockNote(blockNote) : null;
      const result = await storage.blockDate(String(date), !!blocked, note);
      if (blocked) {
        const reason = note ? ` Причина: ${note}` : "";
        await notifyCancelled(
          result.cancelledBookings,
          `Тренер закрыл этот день. Запишитесь на другой.${reason}`,
        );
      }
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json({ slotsCount: result.slots.length, cancelledCount: result.cancelledBookings.length });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось изменить день" });
    }
  });

  app.post("/api/trainer/block-range", async (req, res) => {
    try {
      const { startDate, endDate, blocked, blockNote } = req.body;
      if (!startDate || !endDate) return res.status(400).json({ message: "Укажите начало и конец периода" });
      if (String(startDate) > String(endDate)) {
        return res.status(400).json({ message: "Начало периода должно быть не позже конца" });
      }
      const note = blocked ? sanitizeBlockNote(blockNote) : null;
      const result = await storage.blockDateRange(String(startDate), String(endDate), !!blocked, note);
      if (blocked) {
        const reason = note ? ` Причина: ${note}` : "";
        await notifyCancelled(
          result.cancelledBookings,
          `Тренер закрыл этот период. Запишитесь на другие даты.${reason}`,
        );
      }
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json({ slotsCount: result.slots.length, cancelledCount: result.cancelledBookings.length });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось изменить период" });
    }
  });

  app.get("/api/trainer/blocked-periods", async (_req, res) => {
    try {
      const periods = await storage.getBlockedPeriods();
      res.json({ periods });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить закрытые периоды" });
    }
  });

  // ----- Attendance -----
  app.patch("/api/trainer/bookings/:id/attendance", async (req, res) => {
    try {
      const { attendanceUpdateSchema } = await import("@shared/schema");
      const parsed = attendanceUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Неверные данные" });
      }
      const { id } = req.params;
      const updated = await storage.markAttendance(id, parsed.data.status, parsed.data.note ?? null);
      broadcast({ type: "schedule_update" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Не удалось сохранить отметку" });
    }
  });

  app.get("/api/trainer/students/:id/attendance-stats", async (req, res) => {
    try {
      const { id } = req.params;
      const stats = await storage.getStudentAttendanceStats(id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить статистику" });
    }
  });

  app.patch("/api/trainer/students/:id/sick-leave", async (req, res) => {
    try {
      const { sickLeaveUpdateSchema } = await import("@shared/schema");
      const parsed = sickLeaveUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Неверные данные" });
      }
      const { id } = req.params;
      const result = await storage.setStudentSickLeave(
        id,
        parsed.data.sickUntil,
        parsed.data.sickNote ?? null,
        parsed.data.startDate,
      );
      if (parsed.data.sickUntil && result.cancelledCount > 0) {
        await storage.createNotification({
          userId: id,
          type: "booking_cancelled",
          title: "Записи отменены — болезнь",
          message: `Тренер отметил вас как болеющего до ${parsed.data.sickUntil}. Отменено занятий: ${result.cancelledCount}.`,
          relatedBookingId: null as any,
        });
      }
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Не удалось сохранить" });
    }
  });

  // ----- Payments: membership (ЧВ/БВ) -----
  app.get("/api/trainer/students/:id/membership-payments", async (req, res) => {
    try {
      const { id } = req.params;
      const list = await storage.getMembershipPayments(id);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить оплаты" });
    }
  });

  app.get("/api/trainer/students/:id/next-cv-date", async (req, res) => {
    try {
      const { id } = req.params;
      const nextAllowed = await storage.getNextCvAllowedDate(id);
      res.json({ nextAllowedDate: nextAllowed });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить дату следующей отметки ЧВ" });
    }
  });

  app.post("/api/trainer/students/:id/membership-payments", async (req, res) => {
    try {
      const { membershipPaymentInputSchema } = await import("@shared/schema");
      const parsed = membershipPaymentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Неверные данные" });
      }
      const { id } = req.params;
      const trainerIdRaw = (req.body as any)?.trainerId;
      const trainer = trainerIdRaw ? await storage.getUser(String(trainerIdRaw)) : await storage.getTrainer();
      const createdBy = trainer?.id || id;
      const payment = await storage.addMembershipPayment(id, parsed.data, createdBy);
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 60);
      const horizonStr = horizon.toISOString().split("T")[0];
      await storage.materializeRecurringBookings(horizonStr);
      broadcast({ type: "schedule_update" });
      res.json(payment);
    } catch (error: any) {
      if (error?.message?.startsWith("BEFORE_NEXT_ALLOWED_DATE:")) {
        const date = error.message.split(":")[1];
        return res.status(409).json({ message: `Следующая отметка ЧВ доступна с ${date}`, nextAllowedDate: date });
      }
      if (error?.message === "DUPLICATE_DATE") {
        return res.status(409).json({ message: "БВ на эту дату уже отмечен" });
      }
      res.status(400).json({ message: error?.message || "Не удалось сохранить оплату" });
    }
  });

  app.delete("/api/trainer/membership-payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteMembershipPayment(id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(404).json({ message: error?.message || "Не удалось удалить" });
    }
  });

  // ----- Payments: trainer subscriptions -----
  app.get("/api/trainer/students/:id/trainer-payments", async (req, res) => {
    try {
      const { id } = req.params;
      const list = await storage.getTrainerPayments(id);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить абонементы" });
    }
  });

  app.post("/api/trainer/students/:id/trainer-payments", async (req, res) => {
    try {
      const { trainerPaymentInputSchema } = await import("@shared/schema");
      const parsed = trainerPaymentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Неверные данные" });
      }
      const { id } = req.params;
      const trainerIdRaw = (req.body as any)?.trainerId;
      const trainer = trainerIdRaw ? await storage.getUser(String(trainerIdRaw)) : await storage.getTrainer();
      const createdBy = trainer?.id || id;
      const payment = await storage.addTrainerPayment(id, parsed.data, createdBy);
      res.json(payment);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Не удалось сохранить абонемент" });
    }
  });

  app.patch("/api/trainer/trainer-payments/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.cancelTrainerPayment(id);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Не удалось отменить" });
    }
  });

  app.delete("/api/trainer/trainer-payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTrainerPayment(id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(404).json({ message: error?.message || "Не удалось удалить" });
    }
  });

  // Student / parent / trainer: payment status for a student on a date (YYYY-MM-DD)
  app.get("/api/student/payment-status/:studentId", requireAuth, async (req, res) => {
    try {
      const { studentId } = req.params;
      if (!(await canActForStudent(req, studentId))) {
        return res.status(403).json({ message: "Нет доступа" });
      }
      const dateStr = String(req.query.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ message: "Укажите параметр date в формате YYYY-MM-DD" });
      }
      const user = await storage.getUser(studentId);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      const status = await storage.getStudentPaymentStatus(studentId, dateStr);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить статус оплаты" });
    }
  });

  // Payment status for a specific student on a specific date (YYYY-MM-DD)
  app.get("/api/trainer/students/:id/payment-status", requireAuth, requireTrainer, async (req, res) => {
    try {
      const { id } = req.params;
      const dateStr = String(req.query.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ message: "Укажите параметр date в формате YYYY-MM-DD" });
      }
      const status = await storage.getStudentPaymentStatus(id, dateStr);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить статус оплаты" });
    }
  });

  // ----- Recurring bookings -----
  app.get("/api/trainer/recurring/:studentId", async (req, res) => {
    try {
      const { studentId } = req.params;
      const rules = await storage.getRecurringBookingsByStudent(studentId);
      const withExceptions = await Promise.all(
        rules.map(async (rule) => ({
          ...rule,
          exceptions: await storage.getRecurringBookingExceptions(rule.id),
        })),
      );
      res.json(withExceptions);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить правила" });
    }
  });

  app.post("/api/trainer/recurring", async (req, res) => {
    try {
      const { studentId, weekdays, hour, startDate, endDate, trainerId } = req.body;
      if (!studentId) return res.status(400).json({ message: "Укажите ученика" });
      if (!Array.isArray(weekdays) || weekdays.length === 0) {
        return res.status(400).json({ message: "Выберите хотя бы один день недели" });
      }
      const wd = weekdays.map((n: any) => Number(n)).filter((n: number) => n >= 1 && n <= 7);
      if (wd.length === 0) return res.status(400).json({ message: "Некорректные дни недели" });
      const h = Number(hour);
      if (!Number.isInteger(h) || h < 8 || h > 19) {
        return res.status(400).json({ message: "Время должно быть от 08:00 до 19:00" });
      }
      if (!startDate) return res.status(400).json({ message: "Укажите дату начала" });
      if (endDate && String(endDate) < String(startDate)) {
        return res.status(400).json({ message: "Дата окончания не может быть раньше даты начала" });
      }
      const target = await storage.getUser(String(studentId));
      if (!target || !canHaveRecurringBookings(target)) {
        return res.status(404).json({ message: "Ученик не найден" });
      }

      const newStart = String(startDate);
      const newEnd = endDate ? String(endDate) : "9999-12-31";
      const existingRules = await storage.getRecurringBookingsForIdentity(String(studentId));
      for (const rule of existingRules) {
        if (rule.hour !== h) continue;
        const sharedWeekdays = rule.weekdays.filter((d) => wd.includes(d));
        if (sharedWeekdays.length === 0) continue;
        const ruleEnd = rule.endDate || "9999-12-31";
        if (newStart > ruleEnd || rule.startDate > newEnd) continue;
        const daysLabel = sharedWeekdays
          .map((d) => ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][d - 1])
          .join(", ");
        return res.status(409).json({
          message: `У ученика уже есть постоянная запись на ${String(h).padStart(2, "0")}:00 (${daysLabel})`,
        });
      }

      const creator = trainerId ? await storage.getUser(String(trainerId)) : null;
      const createdBy = creator?.id || sessionUserId(req) || studentId;

      const rule = await storage.createRecurringBooking({
        studentId,
        weekdays: wd,
        hour: h,
        startDate: String(startDate),
        endDate: endDate ? String(endDate) : null,
        createdBy,
      });

      // Materialize 60 days ahead from today
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 60);
      const horizonStr = horizon.toISOString().split("T")[0];
      const result = await storage.materializeRecurringBookings(horizonStr);

      // Notify student (not for trainer's own recurring rule)
      if (target.role === "student" || (target.role === "parent" && target.isAlsoStudent)) {
        await storage.createNotification({
          userId: studentId,
          type: "booking_confirmed",
          title: "Постоянная запись добавлена",
          message: `Тренер настроил для вас постоянную запись на ${String(h).padStart(2, "0")}:00`,
          relatedBookingId: null as any,
        });
      }

      res.status(201).json({ rule, materialized: result });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось создать постоянную запись" });
    }
  });

  // ----- Schedule settings (public read, trainer-only write) -----
  app.get("/api/schedule/settings", async (_req, res) => {
    try {
      const settings = await storage.getTrainerSettings();
      const holidays = await storage.getHolidays();
      res.json({ ...settings, holidays });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить настройки" });
    }
  });

  app.patch("/api/trainer/settings", async (req, res) => {
    try {
      const { trainerSettingsUpdateSchema } = await import("@shared/schema");
      const parsed = trainerSettingsUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Неверные настройки" });
      }
      const result = await storage.updateTrainerSettings(parsed.data);
      // Notify cancelled bookings: we don't have per-booking detail here, but cancelledCount is enough for response
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось сохранить настройки" });
    }
  });

  // ----- Holidays -----
  app.get("/api/trainer/holidays", async (_req, res) => {
    try {
      const list = await storage.getHolidays();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить праздники" });
    }
  });

  app.post("/api/trainer/holidays", async (req, res) => {
    try {
      const { date, name, trainerId } = req.body;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        return res.status(400).json({ message: "Укажите дату в формате YYYY-MM-DD" });
      }
      const result = await storage.addHoliday(String(date), name ?? null, trainerId ?? null);
      // Cancelled count is exposed; cancelled bookings already have status=cancelled
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Не удалось добавить праздник" });
    }
  });

  app.delete("/api/trainer/holidays/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.removeHoliday(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "Не удалось удалить праздник" });
    }
  });

  app.delete("/api/trainer/recurring/:ruleId/exceptions/:date", async (req, res) => {
    try {
      const { ruleId, date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        return res.status(400).json({ message: "Некорректная дата" });
      }
      const rule = await storage.getRecurringBooking(ruleId);
      if (!rule) return res.status(404).json({ message: "Правило не найдено" });
      await storage.removeRecurringBookingException(ruleId, date);
      await storage.materializeRecurringBookings(date);
      broadcast({ type: "schedule_update" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось восстановить дату" });
    }
  });

  app.delete("/api/trainer/recurring/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const rule = await storage.getRecurringBooking(id);
      if (!rule) return res.status(404).json({ message: "Правило не найдено" });
      const result = await storage.deleteRecurringBooking(id);
      // Notify student about cancellations
      if (result.cancelledCount > 0) {
        await storage.createNotification({
          userId: rule.studentId,
          type: "booking_cancelled",
          title: "Постоянная запись отменена",
          message: `Тренер удалил постоянную запись. Отменено будущих занятий: ${result.cancelledCount}`,
          relatedBookingId: null as any,
        });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось удалить правило" });
    }
  });

  // Broadcast notification to students
  app.post("/api/trainer/broadcast", async (req, res) => {
    try {
      const { title, message, recipientType, date, studentIds } = req.body;
      if (!message || !recipientType) {
        return res.status(400).json({ message: "Необходимо указать сообщение и получателей" });
      }

      let targetStudentIds: string[] = [];

      if (recipientType === "all") {
        const students = await storage.getStudentsList(false);
        targetStudentIds = students.map((s) => s.id);
      } else if (recipientType === "date" && date) {
        const slots = await storage.getTimeSlotsByDate(date);
        const studentIdSet = new Set<string>();
        for (const slot of slots) {
          for (const booking of slot.bookings) {
            if (booking.status !== "cancelled" && booking.studentId) {
              studentIdSet.add(booking.studentId);
            }
          }
        }
        targetStudentIds = Array.from(studentIdSet);
      } else if (recipientType === "specific" && Array.isArray(studentIds)) {
        targetStudentIds = studentIds;
      }

      if (targetStudentIds.length === 0) {
        return res.status(400).json({ message: "Нет подходящих получателей" });
      }

      await Promise.all(
        targetStudentIds.map((userId) =>
          storage.createNotification({
            userId,
            type: "broadcast",
            title: title || "Сообщение от тренера",
            message,
            relatedBookingId: null,
          })
        )
      );

      // Send push notifications to all subscribed devices
      const allSubs = await storage.getAllPushSubscriptions();
      const targetSet = new Set(targetStudentIds);
      const pushSubs = allSubs.filter((s) => targetSet.has(s.userId));
      if (pushSubs.length > 0) {
        sendPushToUser(pushSubs, {
          title: title || "Сообщение от тренера",
          body: message,
          icon: "/icon-192.svg",
        }).catch(() => {});
      }

      await storage.createBroadcastLog({
        title: title || "Сообщение от тренера",
        message,
        recipientType,
        recipientCount: targetStudentIds.length,
        recipientIds: targetStudentIds,
        date: recipientType === "date" ? date : null,
      });

      res.json({ sent: targetStudentIds.length });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось отправить рассылку" });
    }
  });

  app.get("/api/trainer/broadcast-logs", async (_req, res) => {
    try {
      const logs = await storage.getBroadcastLogs();
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось получить историю рассылок" });
    }
  });

  app.delete("/api/trainer/broadcast-logs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.deleteBroadcastLog(id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось удалить рассылку" });
    }
  });

  // ── Push subscription routes ──────────────────────────────────────────────

  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({ publicKey: vapidPublicKey });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const userId = sessionUserId(req);
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys) return res.status(400).json({ message: "Неверные данные подписки" });
      await storage.savePushSubscription({ userId, endpoint, keys });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось сохранить подписку" });
    }
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ message: "Не указан endpoint" });
      await storage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось удалить подписку" });
    }
  });

  // Notifications
  app.use("/api/notifications", requireAuth);

  app.get("/api/notifications/:userId", requireSelfOrTrainer("userId"), async (req, res) => {
    try {
      const { userId } = req.params;
      const notifications = await storage.getNotificationsByUser(userId);
      res.json(
        notifications.sort(
          (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
        )
      );
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить уведомления" });
    }
  });

  app.put("/api/notifications/user/:userId/read-all", requireSelfOrTrainer("userId"), async (req, res) => {
    try {
      const { userId } = req.params;
      const count = await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ message: "Не удалось отметить уведомления как прочитанные" });
    }
  });

  app.delete("/api/notifications/user/:userId/read", requireSelfOrTrainer("userId"), async (req, res) => {
    try {
      const { userId } = req.params;
      const count = await storage.deleteReadNotifications(userId);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ message: "Не удалось очистить уведомления" });
    }
  });

  app.put("/api/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getNotification(id);
      if (!existing) return res.status(404).json({ message: "Уведомление не найдено" });
      if (
        !isSessionTrainer(req) &&
        existing.userId !== sessionUserId(req)
      ) {
        return res.status(403).json({ message: "Нет доступа" });
      }
      const notification = await storage.markNotificationAsRead(id);
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: "Не удалось отметить уведомление как прочитанное" });
    }
  });

  // Vercel Cron: напоминания о тренировках (ученикам и тренеру).
  app.get("/api/cron/reminders", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ message: "Unauthorized" });
      }
    }
    try {
      const { runRemindersTick } = await import("./reminders");
      await runRemindersTick();
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Reminder tick failed" });
    }
  });

  const httpServer = createServer(app);
  const websocket = options.websocket ?? true;
  setRealtimeEnabled(websocket);
  if (websocket) {
    setupWebSocket(httpServer);
  }
  return httpServer;
}
