import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { FullScreenSpinner } from "@/components/FullScreenSpinner";
import { Layout } from "@/components/Layout";
import { LoginPage } from "@/features/auth/LoginPage";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { GachaPage } from "@/features/gacha/GachaPage";
import { HomePage } from "@/features/home/HomePage";
import { MorePage } from "@/features/more/MorePage";
import { SetupPage } from "@/features/setup/SetupPage";
import { WishListPage } from "@/features/wishlist/WishListPage";
import { refreshAccessToken, useAuth } from "@/lib/auth";

/** 啟動流程：沒有使用者 → 初始設定；有 refresh cookie → 自動登入；否則 → 登入頁 */
function useBootstrap() {
  const setStatus = useAuth((s) => s.setStatus);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/setup/status");
        if (res.ok && ((await res.json()) as { needs_setup: boolean }).needs_setup) {
          setStatus("needs_setup");
          return;
        }
      } catch {
        // 連不到伺服器（沒開 Tailscale / 離線）：仍嘗試 refresh，失敗就到登入頁顯示提示
      }
      if (!(await refreshAccessToken())) setStatus("anonymous");
    })();
  }, [setStatus]);
}

export default function App() {
  useBootstrap();
  const status = useAuth((s) => s.status);
  const qc = useQueryClient();

  // 登出時清掉快取，避免換人登入看到舊資料
  useEffect(() => {
    if (status === "anonymous") qc.clear();
  }, [status, qc]);

  if (status === "loading") return <FullScreenSpinner />;
  if (status === "needs_setup") {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }
  if (status === "anonymous") {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="wishes" element={<WishListPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="gacha" element={<GachaPage />} />
        <Route path="more" element={<MorePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
