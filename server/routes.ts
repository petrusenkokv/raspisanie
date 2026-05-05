import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage-instance";
import { setupWebSocket, broadcast } from "./ws";
import { sendPushToUser, vapidPublicKey } from "./push";
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

function normalizePhone(input: string): string | null {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) digits = "7" + digits;
  else if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length !== 11 || !digits.startsWith("7")) return null;
  return digits;
}

function calculateAgeYears(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

async function pushNotifyUser(userId: string, title: string, body: string) {
  try {
    const subs = await storage.getPushSubscriptionsByUser(userId);
    if (subs.length > 0) {
      sendPushToUser(subs, { title, body }).catch(() => {});
    }
  } catch {}
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

export async function registerRoutes(app: Express): Promise<Server> {
  
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

      // Check age and parent info
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

      // Check that all active documents are accepted
      const activeDocs = await storage.getDocuments(true);
      const accepted = new Set<string>(Array.isArray(consentDocumentIds) ? consentDocumentIds : []);
      const missing = activeDocs.filter(d => !accepted.has(d.id));
      if (missing.length > 0) {
        return res.status(400).json({
          message: `Необходимо принять документы: ${missing.map(d => d.title).join(", ")}`
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
        password: String(password),
        mustChangePassword: false,
        isPendingApproval: true,
      } as any);

      await recordConsents(user.id, Array.from(accepted));

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
      res.status(500).json({ message: "Не удалось зарегистрировать пользователя" });
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
      if (!password || user.password !== password) {
        return res.status(401).json({ message: "Неверный пароль" });
      }

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

      const allDocs = await storage.getDocuments(true);
      const userConsents = await storage.getConsentsByUser(user.id);
      const signedDocIds = new Set(userConsents.map(c => c.documentId));
      const pendingDocuments = allDocs.filter(d => !signedDocIds.has(d.id));

      res.json({
        user: {
          id: user.id,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        },
        pendingDocuments,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка входа" });
    }
  });

  app.post("/api/auth/sign-consents", async (req, res) => {
    try {
      const { userId, documentIds } = req.body;
      if (!userId || !Array.isArray(documentIds)) {
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
      if (!password || user.password !== password) {
        return res.status(401).json({ message: "Неверный пароль" });
      }

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

  app.post("/api/auth/change-password", async (req, res) => {
    try {
      const { userId, oldPassword, newPassword } = req.body;
      if (!userId || !newPassword || newPassword.length < 4) {
        return res.status(400).json({ message: "Новый пароль должен быть не короче 4 символов" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      if (user.password !== oldPassword) {
        return res.status(401).json({ message: "Неверный текущий пароль" });
      }
      await storage.updateUser(userId, { password: newPassword, mustChangePassword: false });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Не удалось сменить пароль" });
    }
  });

  app.patch("/api/trainer/profile", async (req, res) => {
    try {
      const { userId, phone } = req.body;
      if (!userId) return res.status(400).json({ message: "Не указан пользователь" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      if (user.role !== "trainer") return res.status(403).json({ message: "Доступ только для тренера" });

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

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      const { password: _pw, ...safeUser } = user as any;
      res.json({ user: safeUser });
    } catch {
      res.status(500).json({ message: "Не удалось получить данные пользователя" });
    }
  });

  app.patch("/api/users/me", async (req, res) => {
    try {
      const { userId, ...payload } = req.body ?? {};
      if (!userId) {
        return res.status(400).json({ message: "Не указан пользователь" });
      }
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

  // Helper: ensure recurring rules are materialized up to a given date
  async function ensureMaterializedUntil(dateStr: string) {
    try {
      await storage.materializeRecurringBookings(dateStr);
    } catch {
      // ignore — non-fatal
    }
  }

  // Schedule routes
  app.get("/api/schedule/day/:date", async (req, res) => {
    try {
      const { date } = req.params;
      await ensureMaterializedUntil(date);
      const schedule = await storage.getScheduleForDate(date);
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
      await ensureMaterializedUntil(end.toISOString().split("T")[0]);
      const schedule = await storage.getScheduleForWeek(startDate);
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить расписание недели" });
    }
  });

  app.get("/api/schedule/month/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const lastDay = new Date(parseInt(year), parseInt(month), 0);
      await ensureMaterializedUntil(lastDay.toISOString().split("T")[0]);
      const schedule = await storage.getScheduleForMonth(parseInt(year), parseInt(month));
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить расписание месяца" });
    }
  });

  // Booking routes
  app.post("/api/bookings", async (req, res) => {
    try {
      const { timeSlotId, studentId, notes } = req.body;

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
        bookedBy: studentId,
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

  app.put("/api/bookings/:id/confirm", async (req, res) => {
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
      const { cancelledBy } = req.body ?? {};

      const existing = await storage.getBooking(id);
      if (!existing) {
        return res.status(404).json({ message: "Запись не найдена" });
      }

      // Enforce cancel deadline only for student-self-cancellations
      const canceller = cancelledBy ? await storage.getUser(cancelledBy) : null;
      const cancelledByStudent =
        !!canceller && canceller.role === "student" &&
        canceller.id === existing.studentId;

      if (cancelledByStudent) {
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

      if (cancelledByStudent) {
        // Student cancelled their own booking → notify the trainer
        const trainer = await storage.getTrainer();
        if (trainer) {
          const studentName = canceller.firstName ?? "Ученик";
          const studentLast = canceller.lastName ? ` ${canceller.lastName}` : "";
          await storage.createNotification({
            userId: trainer.id,
            type: "booking_cancelled",
            title: "Ученик отменил запись",
            message: `${studentName}${studentLast} отменил(а) запись: ${when}`,
            relatedBookingId: booking.id,
          });
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
      const { newTimeSlotId, rescheduledBy } = req.body ?? {};
      if (!newTimeSlotId) return res.status(400).json({ message: "Укажите новый слот" });

      const booking = await storage.getRawBooking(id);
      if (!booking) return res.status(404).json({ message: "Запись не найдена" });
      if (booking.status === "cancelled") return res.status(400).json({ message: "Нельзя перенести отменённую запись" });

      // Determine role of the person rescheduling
      const rescheduler = rescheduledBy ? await storage.getUser(rescheduledBy) : null;
      const byRole: "trainer" | "student" = rescheduler?.role === "trainer" ? "trainer" : "student";

      // Students can only reschedule their own bookings
      if (byRole === "student" && booking.studentId !== rescheduler?.id) {
        return res.status(403).json({ message: "Нет доступа" });
      }

      // Enforce cancel deadline for students
      if (byRole === "student") {
        const settings = await storage.getTrainerSettings();
        const oldSlotRaw = await storage.getTimeSlotById(booking.timeSlotId);
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
          await storage.createNotification({
            userId: trainer.id,
            type: "booking_request",
            title: "Ученик перенёс запись",
            message: `${name} перенёс запись: ${fmtSlot(oldSlot)} → ${fmtSlot(newSlot)}${rescheduled.status === "pending" ? ". Требуется подтверждение." : ""}`,
            relatedBookingId: rescheduled.id,
          });
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

  app.get("/api/bookings/student/:studentId", async (req, res) => {
    try {
      const { studentId } = req.params;
      const bookings = await storage.getBookingsByStudent(studentId);
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить записи ученика" });
    }
  });

  // Trainer routes
  app.get("/api/trainer/students", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const students = await storage.getStudentsList(includeInactive);
      const activeDocs = await storage.getDocuments(true);
      const studentsWithConsents = await Promise.all(
        students.map(async (student) => {
          const consents = await storage.getConsentsByUser(student.id);
          const acceptedIds = new Set(consents.map((c) => c.documentId));
          const pendingDocumentCount = activeDocs.filter((d) => !acceptedIds.has(d.id)).length;
          return { ...student, pendingDocumentCount };
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
      const user = await storage.approveStudent(id);
      // Notify student about approval
      await storage.createNotification({
        userId: user.id,
        type: "registration_approved",
        title: "Регистрация одобрена",
        message: "Тренер одобрил вашу регистрацию. Теперь вы можете записываться на тренировки!",
        isRead: false,
        relatedBookingId: null,
      });
      broadcast({ type: "notification_update" });
      broadcast({ type: "user_update", userId: user.id });
      pushNotifyUser(user.id, "Регистрация одобрена", "Тренер одобрил вашу регистрацию. Теперь вы можете записываться на тренировки!");
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

  app.get("/api/trainer/students/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const student = await storage.getStudentWithConsents(id);
      if (!student) return res.status(404).json({ message: "Ученик не найден" });
      res.json(student);
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

      const { firstName, lastName, middleName, birthDate, trainerNotes } = req.body;
      const updates: any = {};
      if (firstName !== undefined) updates.firstName = String(firstName).trim();
      if (lastName !== undefined) updates.lastName = lastName ? String(lastName).trim() : null;
      if (middleName !== undefined) updates.middleName = middleName ? String(middleName).trim() : null;
      if (birthDate !== undefined) updates.birthDate = birthDate || null;
      if (trainerNotes !== undefined) updates.trainerNotes = trainerNotes ? String(trainerNotes) : null;
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
        role: "student",
        isVerified: true,
        password: initialPassword,
        mustChangePassword: true,
      } as any);

      await recordConsents(user.id, Array.from(accepted));

      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ message: "Не удалось добавить ученика" });
    }
  });

  // ----- Documents (consent forms) -----
  app.get("/api/documents", async (_req, res) => {
    try {
      const docs = await storage.getDocuments(true);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ message: "Не удалось получить документы" });
    }
  });

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
      const { title, content, isActive } = req.body;
      if (!title || !content) {
        return res.status(400).json({ message: "Укажите название и текст документа" });
      }
      const doc = await storage.createDocument({
        title: String(title).trim(),
        content: String(content),
        isActive: isActive ?? true,
      });
      res.status(201).json(doc);
    } catch (error) {
      res.status(500).json({ message: "Не удалось создать документ" });
    }
  });

  app.patch("/api/trainer/documents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, isActive } = req.body;
      const updates: Partial<{ title: string; content: string; isActive: boolean }> = {};
      if (title !== undefined) updates.title = String(title).trim();
      if (content !== undefined) updates.content = String(content);
      if (isActive !== undefined) updates.isActive = !!isActive;
      const doc = await storage.updateDocument(id, updates);
      res.json(doc);
    } catch (error) {
      res.status(500).json({ message: "Не удалось обновить документ" });
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
      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Не удалось удалить ученика" });
    }
  });

  app.post("/api/trainer/book-student", async (req, res) => {
    try {
      const { timeSlotId, studentId, notes, trainerId } = req.body;
      
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
      const { blocked } = req.body;
      const result = await storage.blockSlot(id, !!blocked);
      if (blocked) {
        await notifyCancelled(result.cancelledBookings, "Тренер заблокировал это время. Запишитесь на другое.");
      }
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json({ slot: result.slot, cancelledCount: result.cancelledBookings.length });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось изменить слот" });
    }
  });

  app.post("/api/trainer/block-day", async (req, res) => {
    try {
      const { date, blocked } = req.body;
      if (!date) return res.status(400).json({ message: "Укажите дату" });
      const result = await storage.blockDate(String(date), !!blocked);
      if (blocked) {
        await notifyCancelled(result.cancelledBookings, "Тренер закрыл этот день. Запишитесь на другой.");
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
      const { startDate, endDate, blocked } = req.body;
      if (!startDate || !endDate) return res.status(400).json({ message: "Укажите начало и конец периода" });
      if (String(startDate) > String(endDate)) {
        return res.status(400).json({ message: "Начало периода должно быть не позже конца" });
      }
      const result = await storage.blockDateRange(String(startDate), String(endDate), !!blocked);
      if (blocked) {
        await notifyCancelled(result.cancelledBookings, "Тренер закрыл этот период. Запишитесь на другие даты.");
      }
      broadcast({ type: "schedule_update" });
      broadcast({ type: "notification_update" });
      res.json({ slotsCount: result.slots.length, cancelledCount: result.cancelledBookings.length });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось изменить период" });
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

  // Payment status for a specific student on a specific date (YYYY-MM-DD)
  app.get("/api/trainer/students/:id/payment-status", async (req, res) => {
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
      res.json(rules);
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
      const student = await storage.getUser(String(studentId));
      if (!student || student.role !== "student") {
        return res.status(404).json({ message: "Ученик не найден" });
      }

      const creator = trainerId ? await storage.getUser(String(trainerId)) : null;
      const createdBy = creator?.id || studentId;

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

      // Notify student
      await storage.createNotification({
        userId: studentId,
        type: "booking_confirmed",
        title: "Постоянная запись добавлена",
        message: `Тренер настроил для вас постоянную запись на ${String(h).padStart(2, "0")}:00`,
        relatedBookingId: null as any,
      });

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

  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { userId, endpoint, keys } = req.body;
      if (!userId || !endpoint || !keys) return res.status(400).json({ message: "Неверные данные подписки" });
      await storage.savePushSubscription({ userId, endpoint, keys });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось сохранить подписку" });
    }
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
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
  app.get("/api/notifications/:userId", async (req, res) => {
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

  app.put("/api/notifications/user/:userId/read-all", async (req, res) => {
    try {
      const { userId } = req.params;
      const count = await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ message: "Не удалось отметить уведомления как прочитанные" });
    }
  });

  app.delete("/api/notifications/user/:userId/read", async (req, res) => {
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
      const notification = await storage.markNotificationAsRead(id);
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: "Не удалось отметить уведомление как прочитанное" });
    }
  });

  const httpServer = createServer(app);
  setupWebSocket(httpServer);
  return httpServer;
}