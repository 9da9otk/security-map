// src/lib/trpc.ts
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../server/routers"; // مسار صحيح لأن server/routers.ts موجود في جذر repo
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

// يُعيد baseUrl المناسب سواء تشغيل محلي أو على Render
function getBaseUrl() {
  if (typeof window !== "undefined") return ""; // نفس origin الحالي
  // للـ SSR (إن وجد) أو سكربتات خارج المتصفح
  return process.env.VITE_PUBLIC_URL || `http://localhost:${process.env.PORT || 10000}`;
}

export function createTRPCClient() {
  return trpc.createClient({
    transformer: superjson,
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: `${getBaseUrl()}/trpc`,
        fetch(url, options) {
          // لتشخيص أوضح في الشبكة
          return fetch(url, {
            ...options,
            credentials: "include",
            headers: {
              ...(options?.headers || {}),
              "x-client": "vite-react",
            },
          });
        },
      }),
    ],
  });
}
