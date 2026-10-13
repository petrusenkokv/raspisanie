import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { moscowDateString } from "./moscow-date";
import { setupSession } from "./auth";
import { ensureStorageReady, storage } from "./storage-instance";

type AppOptions = {
  serveClient?: boolean;
  websocket?: boolean;
};

export async function createApp(options: AppOptions = {}) {
  console.log("[app] createApp started");
  await ensureStorageReady();
  console.log("[app] ensureStorageReady completed");

  const app = express();
  // Лимит увеличен: тренер загружает фото QR-кода (base64) в настройки оплаты.
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
  setupSession(app);

  app.get("/healthz", (_req, res) => {
    res.status(200).json({
      status: "ok",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      moscowToday: moscowDateString(),
    });
  });

  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({
      status: "ok",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      moscowToday: moscowDateString(),
    });
  });

  // Diagnostic route
  app.get("/api/_debug", (_req, res) => {
    (async () => {
      try {
        const hasDbUrl = !!process.env.DATABASE_URL || !!process.env.LAYERO_DATABASE_URL;
        const storageType = storage.constructor.name;
        let dbTest: any = { error: "not tested yet" };
        try {
          const user = await storage.getUser("nonexistent");
          dbTest = { ok: true, result: user };
        } catch (e: any) {
          dbTest = { error: e.message };
        }
        
        // Test direct PostgreSQL connection
        let pgTest: any = { error: "not tested" };
        try {
          const { getDbInstance } = await import("./db");
          const dbInst = await getDbInstance();
          if (!dbInst) throw new Error("db not initialized");
          const r = await dbInst.execute(dbInst.sql`SELECT 1 as test`);
          pgTest = { ok: true, result: r };
        } catch (e: any) {
          pgTest = { error: e.message };
        }
        
        res.json({
          hasDbUrl,
          storageType,
          dbTest,
          pgTest,
        });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    })();
  });

  // Prevent all caching of API responses (fixes stale data on mobile/PWA)
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    next();
  });

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse !== undefined) {
          const responseText = JSON.stringify(capturedJsonResponse);
          const bytes = Buffer.byteLength(responseText);
          logLine += ` ${bytes}b`;
          if (res.statusCode >= 400 || bytes <= 1000) {
            logLine += ` :: ${responseText}`;
          }
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "...";
        }

        log(logLine);
      }
    });

    next();
  });

  const server = await registerRoutes(app, { websocket: options.websocket });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Внутренняя ошибка сервера";

    console.error(err);
    res.status(status).json({ message });
  });

  // Never serve SPA HTML for unknown API routes (avoids "Unexpected token '<'" on the client)
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API-маршрут не найден. Перезапустите сервер или обновите деплой." });
  });

  if (options.serveClient) {
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }

  return { app, server };
}
