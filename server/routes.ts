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
      const userData = studentRegistrationSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByPhone(userData.phone);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }
      
      const user = await storage.createUser(userData);
      const verifiedUser = await storage.verifyUser(user.id);
      
      res.status(201).json({ 
        user: { 
          id: verifiedUser.id, 
          phone: verifiedUser.phone, 
          firstName: verifiedUser.firstName,
          lastName: verifiedUser.lastName,
          role: verifiedUser.role 
        } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { phone } = req.body;
      
      const user = await storage.getUserByPhone(phone);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.isVerified) {
        return res.status(400).json({ message: "User not verified" });
      }
      
      // Update last login
      await storage.updateUser(user.id, { lastLogin: new Date() });
      
      res.json({ 
        user: { 
          id: user.id, 
          phone: user.phone, 
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role 
        } 
      });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/trainer-login", async (req, res) => {
    try {
      const { phone } = req.body;
      
      const user = await storage.getUserByPhone(phone);
      if (!user || user.role !== "trainer") {
        return res.status(401).json({ message: "Invalid trainer credentials" });
      }
      
      await storage.updateUser(user.id, { lastLogin: new Date() });
      
      res.json({ 
        user: { 
          id: user.id, 
          phone: user.phone, 
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role 
        } 
      });
    } catch (error) {
      res.status(500).json({ message: "Trainer login failed" });
    }
  });

  // Schedule routes
  app.get("/api/schedule/day/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const schedule = await storage.getScheduleForDate(date);
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch daily schedule" });
    }
  });

  app.get("/api/schedule/week/:startDate", async (req, res) => {
    try {
      const { startDate } = req.params;
      const schedule = await storage.getScheduleForWeek(startDate);
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch weekly schedule" });
    }
  });

  app.get("/api/schedule/month/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
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
      res.json(students.map(student => ({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        createdAt: student.createdAt,
        lastLogin: student.lastLogin
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch students list" });
    }
  });

  app.post("/api/trainer/students", async (req, res) => {
    try {
      const { phone, firstName, lastName } = req.body;
      if (!phone || !firstName) {
        return res.status(400).json({ message: "Имя и телефон обязательны" });
      }
      const normalizedPhone = String(phone).replace(/\D/g, "");
      if (normalizedPhone.length < 10) {
        return res.status(400).json({ message: "Некорректный номер телефона" });
      }
      const existing = await storage.getUserByPhone(normalizedPhone);
      if (existing) {
        return res.status(400).json({ message: "Ученик с таким телефоном уже существует" });
      }
      const user = await storage.createUser({
        phone: normalizedPhone,
        firstName: String(firstName).trim(),
        lastName: lastName ? String(lastName).trim() : null,
        role: "student",
        isVerified: true,
      } as any);
      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ message: "Не удалось добавить ученика" });
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

  // Notifications
  app.get("/api/notifications/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const notifications = await storage.getNotificationsByUser(userId);
      res.json(notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
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