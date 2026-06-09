type CompressImageOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxBytes?: number;
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть изображение"));
    };
    img.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Не удалось сжать изображение"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });

/** Resize and compress before upload — keeps requests under Vercel body limits. */
export const compressImageFile = async (
  file: File,
  options: CompressImageOptions = {},
): Promise<File> => {
  const maxWidth = options.maxWidth ?? 1600;
  const maxHeight = options.maxHeight ?? 2400;
  let quality = options.quality ?? 0.82;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;

  const img = await loadImage(file);
  let { width, height } = img;
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas недоступен");
  }
  ctx.drawImage(img, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > maxBytes && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size > maxBytes) {
    throw new Error(
      "Фото слишком большое даже после сжатия. Сделайте скрин меньшего размера или обрежьте его.",
    );
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "schedule-poster";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
};

export const readFileAsBase64 = (file: File): Promise<{ data: string; contentType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Не удалось прочитать файл"));
        return;
      }
      resolve({ data: result, contentType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("Ошибка чтения файла"));
    reader.readAsDataURL(file);
  });
