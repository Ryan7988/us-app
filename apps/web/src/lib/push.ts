import { api, unwrap } from "./api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

async function sendSubscription(sub: PushSubscription): Promise<void> {
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await unwrap(
    api.POST("/api/v1/push/subscribe", {
      body: { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
    }),
  );
}

/** iOS：必須由使用者點擊觸發，而且只有主畫面版本可以。 */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("這個瀏覽器不支援通知（iPhone 請從主畫面的 App 開啟）");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("通知權限被拒絕了，可以到 iPhone 設定 → 通知 裡打開");
  const reg = await navigator.serviceWorker.ready;
  const { key } = await unwrap(api.GET("/api/v1/push/vapid-public-key"));
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    }));
  await sendSubscription(sub);
}

/** 每次開 App 都把現有訂閱再送一次（伺服器搬家、資料還原後也能自動恢復）。 */
export async function resyncPush(): Promise<void> {
  if (pushPermission() !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sendSubscription(sub);
  } catch {
    /* ignore */
  }
}
