import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

const ensureServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker не поддерживается");
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
};

const hasPushApi = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

const isIosDevice = () => {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};

const isStandaloneApp = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

export const getPushUnsupportedReason = (): string | null => {
  if (hasPushApi()) return null;
  if (isIosDevice() && !isStandaloneApp()) {
    return "На iPhone в Safari push недоступен. Добавьте сайт на экран «Домой» (Поделиться → «На экран Домой») и откройте оттуда.";
  }
  if (isIosDevice()) {
    return "Push на iPhone работает только из приложения на экране «Домой» (iOS 16.4+).";
  }
  return "Этот браузер не поддерживает push. На Android используйте Chrome.";
};

const readBrowserSubscription = async (): Promise<PushSubscription | null> => {
  if (!hasPushApi()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
};

/** off = нет активной подписки; on = push включён; denied = браузер запретил; unsupported = API нет */
export type PushStatus = "unsupported" | "denied" | "off" | "on";

export function usePushNotifications(userId: string | undefined) {
  const [status, setStatus] = useState<PushStatus>("unsupported");
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const syncStatus = useCallback(async () => {
    if (!hasPushApi()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const sub = await readBrowserSubscription();
    setStatus(sub ? "on" : "off");
  }, []);

  useEffect(() => {
    void syncStatus();
  }, [syncStatus, userId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncStatus();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncStatus]);

  const subscribe = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || !hasPushApi()) return;
    setLoading(true);
    setLastError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("denied");
        setLastError("Разрешите уведомления в настройках браузера");
        return;
      }
      if (permission !== "granted") {
        setStatus("off");
        return;
      }

      const reg = await ensureServiceWorker();
      const keyRes = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        throw new Error("Push не настроен на сервере (VAPID)");
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await apiRequest("POST", "/api/push/subscribe", {
        userId: uid,
        endpoint: json.endpoint,
        keys: json.keys,
      });
      setStatus("on");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Не удалось включить push";
      setLastError(message);
      await syncStatus();
    } finally {
      setLoading(false);
    }
  }, [syncStatus]);

  const unsubscribe = useCallback(async () => {
    if (!userIdRef.current || !hasPushApi()) return;
    setLoading(true);
    setLastError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiRequest("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Не удалось отключить push";
      setLastError(message);
      await syncStatus();
    } finally {
      setLoading(false);
    }
  }, [syncStatus]);

  const unsupportedReason = status === "unsupported" ? getPushUnsupportedReason() : null;

  return { status, loading, lastError, unsupportedReason, subscribe, unsubscribe, syncStatus };
}
