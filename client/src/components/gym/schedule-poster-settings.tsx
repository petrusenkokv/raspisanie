import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { uploadSchedulePoster } from "@/lib/upload-schedule-poster";
import { ExternalLink, ImageUp, Loader2 } from "lucide-react";

type PosterMeta = {
  url: string;
  updatedAt: string | null;
};

type SchedulePosterSettingsProps = {
  enabled: boolean;
};

export function SchedulePosterSettings({ enabled }: SchedulePosterSettingsProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [poster, setPoster] = useState<PosterMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch("/api/schedule-poster", { credentials: "include" })
      .then((r) => r.json())
      .then((data: PosterMeta) => setPoster(data))
      .catch(() => setPoster(null))
      .finally(() => setLoading(false));
  }, [enabled]);

  const handleSelectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Нужен файл изображения (JPG, PNG, WebP)" });
      return;
    }

    setUploading(true);
    try {
      const data = await uploadSchedulePoster(file);
      setPoster(data);
      toast({ title: "Картинка расписания обновлена" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Не удалось загрузить";
      toast({ variant: "destructive", title: "Ошибка", description: message });
    } finally {
      setUploading(false);
    }
  };

  const previewSrc = poster
    ? `${poster.url}${poster.updatedAt ? `?v=${encodeURIComponent(poster.updatedAt)}` : ""}`
    : undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Запасная страница с фото или скрином расписания. Работает даже если база данных недоступна.
        Ученики открывают ссылку и видят только картинку.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/poster">
          <Button type="button" variant="outline" size="sm">
            <ExternalLink className="h-4 w-4 mr-1" />
            Открыть /poster
          </Button>
        </Link>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
          aria-label="Выбрать картинку расписания"
          onChange={handleSelectFile}
        />
        <Button
          type="button"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ImageUp className="h-4 w-4 mr-1" />}
          {uploading ? "Загрузка…" : "Загрузить картинку"}
        </Button>
      </div>

      <div>
        <Label className="text-xs text-gray-500">Текущая картинка</Label>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        ) : previewSrc ? (
          <img
            src={previewSrc}
            alt="Превью картинки расписания"
            className="mt-2 w-full max-h-48 object-contain rounded border bg-white"
          />
        ) : (
          <p className="text-sm text-gray-500 mt-2">Картинка ещё не загружена</p>
        )}
      </div>
    </div>
  );
}
