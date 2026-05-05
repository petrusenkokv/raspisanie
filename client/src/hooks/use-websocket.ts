import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGymStore } from "@/store/gym-store";

export function useWebSocket() {
  const queryClient = useQueryClient();
  const { currentUser, setUser } = useGymStore();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let alive = true;

    function connect() {
      ws = new WebSocket(url);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "schedule_update") {
            queryClient.invalidateQueries({ queryKey: ["schedule"] });
          }
          if (msg.type === "notification_update") {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          }
          if (msg.type === "user_update") {
            // Refresh current user data if it's our user
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
        }
      };

      ws.onclose = () => {
        if (alive) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [queryClient]);
}
