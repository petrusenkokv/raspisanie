import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function readErrorMessage(res: Response): Promise<string> {
  const text = (await res.text()) || res.statusText;
  const trimmed = text.trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "Сервер вернул HTML вместо JSON. Перезапустите приложение (npm run dev:win) или обновите сайт на Vercel.";
  }
  try {
    const json = JSON.parse(trimmed);
    if (json?.message) return String(json.message);
  } catch {
    /* not JSON */
  }
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
}

/** Parse JSON body; show a clear error if the server returned HTML (SPA fallback). */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      "Сервер вернул HTML вместо JSON. Перезапустите приложение (npm run dev:win) или обновите сайт на Vercel.",
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(trimmed || "Некорректный ответ сервера");
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
