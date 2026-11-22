import { Suspense, useEffect } from "react";
import { FullScreenSpinner } from "./FullScreenSpinner";
import { Outlet, useLocation } from "react-router-dom";
import { useAutoLocation } from "@/features/location/api";
import { resyncPush } from "@/lib/push";
import { useRealtime } from "@/lib/ws";
import { InstallGuide } from "./InstallGuide";
import { OfflineBanner } from "./OfflineBanner";
import { TabBar } from "./TabBar";
import { UpdatePrompt } from "./UpdatePrompt";

export function Layout() {
  useRealtime();
  useAutoLocation();
  const { pathname } = useLocation();
  useEffect(() => {
    resyncPush();
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="pt-safe min-h-full">
      <OfflineBanner />
      <main className="mx-auto max-w-lg px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
        <Suspense fallback={<FullScreenSpinner />}>
          <Outlet />
        </Suspense>
      </main>
      <TabBar />
      <UpdatePrompt />
      <InstallGuide />
    </div>
  );
}
