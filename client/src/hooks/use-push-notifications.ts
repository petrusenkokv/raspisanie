import { useState, useEffect, useCallback } from "react";
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

export type PushStatus = "unsupported" | "default" | "granted" | "denied";

export function usePushNotifications(userId: string | undefined) {
  const [status, setStatus] = useState<PushStatus>("unsupported");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission as PushStatus);
  }, []);

  const subscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as PushStatus);
      if (permission !== "granted") return;

      const reg = await ensureServiceWorker();
      const res = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await res.json();
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
        userId,
        endpoint: json.endpoint,
        keys: json.keys,
      });
      setStatus("granted");
    } catch {
      setStatus(Notification.permission as PushStatus);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const unsubscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiRequest("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setStatus("default");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return { status, loading, subscribe, unsubscribe };
}
