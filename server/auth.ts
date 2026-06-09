import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import MemoryStore from "memorystore";
import bcrypt from "bcryptjs";
import { getPgPool } from "./pg-pool";
import type { User } from "@shared/schema";

const BCRYPT_ROUNDS = 12;
const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: "trainer" | "student" | "parent";
  }
}

export function isPasswordHash(stored: string): boolean {
  return stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!plain || !stored) return false;
  if (isPasswordHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return stored === plain;
}

/** After plain-text match, upgrade row to bcrypt. */
export async function upgradePasswordHashIfNeeded(
  updatePassword: (userId: string, hash: string) => Promise<void>,
  userId: string,
  plain: string,
  stored: string,
): Promise<void> {
  if (isPasswordHash(stored)) return;
  if (stored !== plain) return;
  const hash = await hashPassword(plain);
  await updatePassword(userId, hash);
}

export function toPublicUser(user: User) {
  const {
    password: _password,
    verificationCode: _code,
    ...safe
  } = user;
  return safe;
}

export async function saveSession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export async function establishSession(req: Request, user: User): Promise<void> {
  req.session.userId = user.id;
  req.session.role = user.role as "trainer" | "student" | "parent";
  await saveSession(req);
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

export function setupSession(app: Express): void {
  const secret =
    process.env.SESSION_SECRET || "dev-gym-schedule-secret-change-in-production";
  const isProduction = process.env.NODE_ENV === "production";

  const sessionOptions: session.SessionOptions = {
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    },
  };

  if (process.env.DATABASE_URL) {
    const PgStore = connectPgSimple(session);
    sessionOptions.store = new PgStore({
      pool: getPgPool(),
      createTableIfMissing: true,
      tableName: "session",
    });
  } else {
    const MemStore = MemoryStore(session);
    sessionOptions.store = new MemStore({
      checkPeriod: 86400000,
    });
  }

  app.set("trust proxy", 1);
  app.use(session(sessionOptions));
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  next();
}

export function requireTrainer(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }
  if (req.session.role !== "trainer") {
    res.status(403).json({ message: "Доступ только для тренера" });
    return;
  }
  next();
}

/** Param must match session user, unless caller is trainer. */
export function requireSelfOrTrainer(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session?.userId) {
      res.status(401).json({ message: "Требуется вход в систему" });
      return;
    }
    const targetId = req.params[paramName] ?? req.body?.[paramName];
    if (
      req.session.role !== "trainer" &&
      targetId &&
      targetId !== req.session.userId
    ) {
      res.status(403).json({ message: "Нет доступа" });
      return;
    }
    next();
  };
}

export function sessionUserId(req: Request): string {
  return req.session!.userId!;
}

export function isSessionTrainer(req: Request): boolean {
  return req.session?.role === "trainer";
}
