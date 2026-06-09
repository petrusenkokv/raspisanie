import type { Request } from "express";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const POSTER_BLOB_PREFIX = "schedule-poster/";

export const toWebRequest = (req: Request): globalThis.Request => {
  const host = req.get("host") ?? "localhost";
  const protocol = req.get("x-forwarded-proto") ?? req.protocol ?? "http";
  const url = `${protocol}://${host}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return new Request(url, { method: req.method, headers });
};

export const handleSchedulePosterUpload = async (
  req: Request,
  body: HandleUploadBody,
): Promise<Record<string, unknown>> => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Blob storage не настроен");
  }

  return handleUpload({
    body,
    request: toWebRequest(req),
    onBeforeGenerateToken: async (pathname) => {
      if (!pathname.startsWith(POSTER_BLOB_PREFIX)) {
        throw new Error("Недопустимый путь файла");
      }
      return {
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
        maximumSizeInBytes: 5 * 1024 * 1024,
        addRandomSuffix: false,
      };
    },
    onUploadCompleted: async () => {
      /* URL returned to client; listed via getSchedulePoster */
    },
  });
};
