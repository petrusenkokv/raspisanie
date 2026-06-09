import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { join } from "path";
import { list, put } from "@vercel/blob";

const BLOB_PREFIX = "schedule-poster/";
const LOCAL_DIR = join(process.cwd(), "data");
const LOCAL_FILE = join(LOCAL_DIR, "schedule-poster.jpg");

export type SchedulePosterMeta = {
  url: string;
  updatedAt: string | null;
};

const PLACEHOLDER_URL = "/schedule-poster-placeholder.svg";

export async function getSchedulePoster(): Promise<SchedulePosterMeta> {
  const envUrl = process.env.SCHEDULE_POSTER_URL?.trim();
  if (envUrl) {
    return { url: envUrl, updatedAt: null };
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { blobs } = await list({ prefix: BLOB_PREFIX, limit: 1 });
      const latest = blobs[0];
      if (latest) {
        return {
          url: latest.url,
          updatedAt: latest.uploadedAt.toISOString(),
        };
      }
    } catch {
      /* blob unavailable */
    }
  }

  try {
    const fileStat = await stat(LOCAL_FILE);
    return {
      url: "/api/schedule-poster/file",
      updatedAt: fileStat.mtime.toISOString(),
    };
  } catch {
    /* no local file */
  }

  return { url: PLACEHOLDER_URL, updatedAt: null };
}

export async function saveSchedulePoster(
  buffer: Buffer,
  contentType: string,
): Promise<SchedulePosterMeta> {
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const pathname = `${BLOB_PREFIX}current.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(pathname, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return { url: blob.url, updatedAt: new Date().toISOString() };
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, buffer);
  return {
    url: "/api/schedule-poster/file",
    updatedAt: new Date().toISOString(),
  };
}

export async function readLocalSchedulePoster(): Promise<Buffer | null> {
  try {
    return await readFile(LOCAL_FILE);
  } catch {
    return null;
  }
}
