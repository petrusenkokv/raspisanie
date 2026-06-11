import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGymStore } from "@/store/gym-store";

let wsHookCount = 0;
let wsAlive = false;
let wsReconnectTimer: ReturnType<typeof setTimeout> | undefined;
let wsInstance: WebSocket | undefined;

export const isRealtimeDisabled = (): boolean => {
  if (typeof window === "undefined") return true;
  return (
    import.meta.env.VITE_DISABLE_WEBSOCKET === "1" ||
    window.location.hostname.endsWith(".vercel.app")
  );
};

function connectWebSocket(queryClient: ReturnType<typeof useQueryClient>) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws`;

  wsInstance = new WebSocket(url);

  wsInstance.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.type === "schedule_update") {
        void queryClient.refetchQueries({ queryKey: ["schedule"] });
        void queryClient.refetchQueries({ queryKey: ["/api/schedule/day"] });
      }
      if (msg.type === "notification_update") {
        void queryClient.refetchQueries({ queryKey: ["/api/notifications"] });
      }
      if (msg.type === "user_update") {
        const user = useGymStore.getState().currentUser;
        if (user && (!msg.userId || msg.userId === user.id)) {
          fetch(`/api/users/${user.id}`)
            .then((r) => r.json())
            .then((data) => {
              if (data?.user) {
                useGymStore.getState().setUser(data.user);
              }
            })
            .catch(() => {});
        }
      }
    } catch {
      /* ignore malformed messages */
    }
  };

  wsInstance.onclose = () => {
    if (wsAlive) {
      wsReconnectTimer = setTimeout(() => connectWebSocket(queryClient), 3000);
    }
  };

  wsInstance.onerror = () => {
    wsInstance?.close();
  };
}

function startWebSocket(queryClient: ReturnType<typeof useQueryClient>) {
  if (wsHookCount === 1) {
    wsAlive = true;
    connectWebSocket(queryClient);
  }
}

function stopWebSocket() {
  if (wsHookCount > 0) return;
  wsAlive = false;
  clearTimeout(wsReconnectTimer);
  wsInstance?.close();
  wsInstance = undefined;
}

/** Real-time updates via WebSocket (local dev). On Vercel — no background polling. */
export function useWebSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isRealtimeDisabled()) {
      return;
    }

    wsHookCount += 1;
    startWebSocket(queryClient);
    return () => {
      wsHookCount -= 1;
      stopWebSocket();
    };
  }, [queryClient]);
}
