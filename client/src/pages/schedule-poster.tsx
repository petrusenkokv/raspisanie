import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGymStore } from "@/store/gym-store";
import { useToast } from "@/hooks/use-toast";
import { uploadSchedulePoster } from "@/lib/upload-schedule-poster";
import { ArrowLeft, ImageUp, Loader2, ExternalLink } from "lucide-react";

type PosterMeta = {
  url: string;
  updatedAt: string | null;
};

export function SchedulePosterPage() {
  const { toast } = useToast();
  const isTrainer = useGymStore((s) => s.isTrainer());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [poster, setPoster] = useState<PosterMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPoster = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/schedule-poster", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить картинку");
      }
      const data = (await response.json()) as PosterMeta;
      setPoster(data);
    } catch {
      setError("Не удалось загрузить картинку расписания");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPoster();
  }, []);

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
      toast({ title: "Картинка обновлена", description: "Ученики увидят новое расписание на этой странице" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Не удалось загрузить картинку";
      toast({ variant: "destructive", title: "Ошибка загрузки", description: message });
    } finally {
      setUploading(false);
    }
  };

  const imageSrc = poster
    ? `${poster.url}${poster.updatedAt ? `?v=${encodeURIComponent(poster.updatedAt)}` : ""}`
    : undefined;

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/">
            <Button variant="ghost" size="sm" className="shrink-0" aria-label="На главную">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Расписание</span>
            </Button>
          </Link>
          <h1 className="text-sm sm:text-base font-semibold truncate">Расписание (картинка)</h1>
        </div>
        {isTrainer && (
          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="sr-only"
              aria-label="Выбрать картинку расписания"
              onChange={handleSelectFile}
            />
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Загрузить новую картинку расписания"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1">{uploading ? "Загрузка…" : "Заменить"}</span>
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1 p-2 sm:p-4">
        {loading && (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" aria-hidden="true" />
            Загрузка…
          </div>
        )}

        {!loading && error && (
          <div className="max-w-lg mx-auto text-center py-16 px-4">
            <p className="text-zinc-600 mb-4">{error}</p>
            <Button variant="outline" onClick={() => void loadPoster()}>
              Повторить
            </Button>
          </div>
        )}

        {!loading && !error && imageSrc && (
          <figure className="max-w-5xl mx-auto">
            <img
              src={imageSrc}
              alt="Расписание тренировок"
              className="w-full h-auto rounded-lg border bg-white shadow-sm"
            />
            {poster?.updatedAt && (
              <figcaption className="text-center text-xs text-zinc-500 mt-2">
                Обновлено: {new Date(poster.updatedAt).toLocaleString("ru-RU")}
              </figcaption>
            )}
          </figure>
        )}

        {isTrainer && !loading && (
          <p className="max-w-2xl mx-auto text-center text-xs text-zinc-500 mt-4 px-4">
            Эта страница работает даже если база данных недоступна. Загрузите скрин или фото расписания — ученики
            откроют{" "}
            <a href="/poster" className="underline inline-flex items-center gap-0.5">
              /poster
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
