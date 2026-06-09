import { upload } from "@vercel/blob/client";
import { apiRequest } from "@/lib/queryClient";
import { compressImageFile, readFileAsBase64 } from "@/lib/compress-image";

export type SchedulePosterMeta = {
  url: string;
  updatedAt: string | null;
};

const POSTER_BLOB_PATH = "schedule-poster/current.jpg";

export const uploadSchedulePoster = async (file: File): Promise<SchedulePosterMeta> => {
  const compressed = await compressImageFile(file);

  try {
    const blob = await upload(POSTER_BLOB_PATH, compressed, {
      access: "public",
      handleUploadUrl: "/api/trainer/schedule-poster/upload",
    });
    return { url: blob.url, updatedAt: new Date().toISOString() };
  } catch {
    const payload = await readFileAsBase64(compressed);
    const response = await apiRequest("POST", "/api/trainer/schedule-poster", payload);
    return response.json() as Promise<SchedulePosterMeta>;
  }
};
