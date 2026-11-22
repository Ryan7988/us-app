import { useRegisterSW } from "virtual:pwa-register/react";

/** 有新版本時顯示提示；App 開啟和回到前景都會檢查。 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (document.visibilityState === "visible" && navigator.onLine) reg.update();
      };
      document.addEventListener("visibilitychange", check);
      setInterval(check, 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-white shadow-xl dark:bg-white dark:text-stone-900">
      <span className="text-xl">✨</span>
      <p className="flex-1 text-sm">有新功能囉！</p>
      <button className="text-sm text-stone-400" onClick={() => setNeedRefresh(false)}>
        稍後
      </button>
      <button
        className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white"
        onClick={() => updateServiceWorker(true)}
      >
        更新
      </button>
    </div>
  );
}
