/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

// App shell：precache（離線也能開）
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA：所有導覽請求回 index.html，但 /api、/media 不攔
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/media\//],
  }),
);

// 縮圖：CacheFirst，最多 500 張、30 天（P4 相簿上線後生效）
registerRoute(
  ({ url }) => url.pathname.startsWith("/media/thumbs/"),
  new CacheFirst({
    cacheName: "thumbs",
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 30 * 86400 })],
  }),
);

// 「有新版本」→ 使用者按下更新才 skipWaiting（registerType: prompt）
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
clientsClaim();

// ---- Web Push（P2 啟用）----
interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = { title: "我們" };
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    payload = { title: "我們", body: event.data?.text() };
  }
  // iOS 規定每次推播都必須顯示可見通知
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await (c as WindowClient).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
