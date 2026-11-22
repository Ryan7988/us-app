import { useOnline } from "@/lib/online";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-800 dark:bg-amber-900/60 dark:text-amber-100">
      離線中：顯示的是最後一次載入的資料，暫時不能新增或修改
    </div>
  );
}
