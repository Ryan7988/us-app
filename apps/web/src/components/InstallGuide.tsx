import { useState } from "react";
import { isIOS, isStandalone } from "@/lib/platform";
import { ShareIcon } from "./icons";

const KEY = "install-guide-dismissed";

/** iOS 沒有自動安裝提示：在 Safari（非主畫面）開啟時，教她「分享 → 加入主畫面」。 */
export function InstallGuide() {
  const [hidden, setHidden] = useState(() => {
    try {
      return isStandalone() || !isIOS() || sessionStorage.getItem(KEY) === "1";
    } catch {
      return true;
    }
  });
  if (hidden) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3" onClick={dismiss}>
      <div
        className="card pb-safe mx-auto mb-2 w-full max-w-md space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">把「我們」加到主畫面 💕</h2>
        <ol className="space-y-3 text-[15px]">
          <li className="flex items-center gap-3">
            <Step n={1} />點 Safari 下方的
            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-sky-600 dark:bg-stone-700">
              <ShareIcon className="size-4" /> 分享
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} />
            往下滑，選「加入主畫面」
          </li>
          <li className="flex items-center gap-3">
            <Step n={3} />
            從主畫面的圖示打開，再登入一次
          </li>
        </ol>
        <p className="text-xs text-stone-400">
          主畫面版本才能收通知、全螢幕使用。Safari 和主畫面版本的登入是分開的，所以要再登入一次喔。
        </p>
        <button className="btn-primary w-full" onClick={dismiss}>
          知道了
        </button>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600">
      {n}
    </span>
  );
}
