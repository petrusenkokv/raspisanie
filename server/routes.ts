import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  insertBookingSchema, 
  phoneVerificationSchema,
  studentRegistrationSchema,
  trainerLoginSchema,
  bookingRequestSchema
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
      res.json({ success: true, message: "Verification code sent", code: verificationCode });
    } catch (error) {
      res.status(500).json({ message: "Failed to send verification code" });
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
      } as any);

      await recordConsents(user.id, Array.from(accepted));

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
      res.status(500).json({ message: "Failed to register user" });
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
      if (!user.isVerified) {
        return res.status(400).json({ message: "Пользователь не подтверждён" });
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
      res.status(500).json({ message: "Login failed" });
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
      res.status(500).json({ message: "Trainer login failed" });
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
      res.status(500).json({ message: "Failed to fetch daily schedule" });
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
      res.status(500).json({ message: "Failed to fetch weekly schedule" });
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
      res.status(500).json({ message: "Failed to fetch monthly schedule" });
    }
  });

  // Booking routes
  app.post("/api/bookings", async (req, res) => {
    try {
      const { timeSlotId, studentId, notes } = req.body;

      // Get the target time slot to know its date
      const targetSlot = await storage.getTimeSlotById(timeSlotId);
      if (!targetSlot) {
        return res.status(404).json({ message: "Time slot not found" });
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

      // Check if time slot is available
      const existingBookings = await storage.getBookingsByTimeSlot(timeSlotId);
      const confirmedBookings = existingBookings.filter(b => b.status === "confirmed");
      
      if (confirmedBookings.length >= 2) {
        return res.status(400).json({ message: "Time slot is fully booked" });
      }
      
      const booking = await storage.createBooking({
        studentId,
        timeSlotId,
        bookedBy: studentId,
        status: "pending",
        notes: notes || null
      });
      
      // Create notification for trainer
      const trainers = Array.from(await storage.getStudentsList()).filter(u => u.role === "trainer");
      if (trainers.length > 0) {
        await storage.createNotification({
          userId: trainers[0].id,
          type: "booking_request",
          title: "Новая заявка на запись",
          message: `Ученик хочет записаться на занятие`,
          relatedBookingId: booking.id
        });
      }
      
      const bookingWithDetails = await storage.getBooking(booking.id);
      res.status(201).json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.put("/api/bookings/:id/confirm", async (req, res) => {
    try {
      const { id } = req.params;
      const booking = await storage.confirmBooking(id);
      
      // Create notification for student
      await storage.createNotification({
        userId: booking.studentId,
        type: "booking_confirmed",
        title: "Запись подтверждена",
        message: "Ваша запись на тренировку подтверждена тренером",
        relatedBookingId: booking.id
      });
      
      const bookingWithDetails = await storage.getBooking(booking.id);
      res.json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to confirm booking" });
    }
  });

  app.put("/api/bookings/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      const booking = await storage.cancelBooking(id);
      
      // Create notification for student
      await storage.createNotification({
        userId: booking.studentId,
        type: "booking_cancelled",
        title: "Запись отменена",
        message: "Ваша запись на тренировку была отменена",
        relatedBookingId: booking.id
      });
      
      const bookingWithDetails = await storage.getBooking(booking.id);
      res.json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  });

  app.get("/api/bookings/student/:studentId", async (req, res) => {
    try {
      const { studentId } = req.params;
      const bookings = await storage.getBookingsByStudent(studentId);
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch student bookings" });
    }
  });

  // Trainer routes
  app.get("/api/trainer/students", async (req, res) => {
    try {
      const students = await storage.getStudentsList();
      res.json(students);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch students list" });
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

      const { firstName, lastName, middleName, birthDate, trainerNotes, parentFullName, parentPhone } = req.body;
      const updates: any = {};
      if (firstName !== undefined) updates.firstName = String(firstName).trim();
      if (lastName !== undefined) updates.lastName = lastName ? String(lastName).trim() : null;
      if (middleName !== undefined) updates.middleName = middleName ? String(middleName).trim() : null;
      if (birthDate !== undefined) updates.birthDate = birthDate || null;
      if (trainerNotes !== undefined) updates.trainerNotes = trainerNotes ? String(trainerNotes) : null;
      if (parentFullName !== undefined) updates.parentFullName = parentFullName ? String(parentFullName).trim() : null;
      if (parentPhone !== undefined) {
        if (parentPhone) {
          const np = normalizePhone(parentPhone);
          if (!np) return res.status(400).json({ message: "Некорректный телефон представителя" });
          updates.parentPhone = np;
        } else {
          updates.parentPhone = null;
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
        parentFullName,
        parentPhone,
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

      // Parent info if under 14
      const age = calculateAgeYears(birthDate);
      let normalizedParentPhone: string | null = null;
      let parentName: string | null = null;
      if (age !== null && age < 14) {
        if (!parentFullName || !String(parentFullName).trim()) {
          return res.status(400).json({ message: "Для ученика младше 14 лет укажите ФИО законного представителя" });
        }
        const np = normalizePhone(parentPhone);
        if (!np) {
          return res.status(400).json({ message: "Укажите корректный телефон законного представителя" });
        }
        normalizedParentPhone = np;
        parentName = String(parentFullName).trim();
      } else if (parentFullName || parentPhone) {
        // Allow optional parent info even for older students
        if (parentFullName) parentName = String(parentFullName).trim();
        if (parentPhone) {
          const np = normalizePhone(parentPhone);
          if (np) normalizedParentPhone = np;
        }
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
        phone: normalizedPhone,
        firstName: String(firstName).trim(),
        lastName: lastName ? String(lastName).trim() : null,
        middleName: middleName ? String(middleName).trim() : null,
        birthDate: birthDate || null,
        trainerNotes: trainerNotes ? String(trainerNotes) : null,
        parentFullName: parentName,
        parentPhone: normalizedParentPhone,
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
      res.status(201).json(bookingWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to book student" });
    }
  });

  app.put("/api/trainer/time-slots/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const timeSlot = await storage.updateTimeSlot(id, updates);
      res.json(timeSlot);
    } catch (error) {
      res.status(500).json({ message: "Failed to update time slot" });
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

  app.patch("/api/trainer/time-slots/:id/block", async (req, res) => {
    try {
      const { id } = req.params;
      const { blocked } = req.body;
      const result = await storage.blockSlot(id, !!blocked);
      if (blocked) {
        await notifyCancelled(result.cancelledBookings, "Тренер заблокировал это время. Запишитесь на другое.");
      }
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
      res.json({ slotsCount: result.slots.length, cancelledCount: result.cancelledBookings.length });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось изменить период" });
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
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.put("/api/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const notification = await storage.markNotificationAsRead(id);
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}