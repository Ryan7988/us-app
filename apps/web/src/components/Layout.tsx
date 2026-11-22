import { Outlet } from "react-router-dom";
import { useRealtime } from "@/lib/ws";
import { InstallGuide } from "./InstallGuide";
import { OfflineBanner } from "./OfflineBanner";
import { TabBar } from "./TabBar";
import { UpdatePrompt } from "./UpdatePrompt";

export function Layout() {
  useRealtime();
  return (
    <div className="pt-safe min-h-full">
      <OfflineBanner />
      <main className="mx-auto max-w-lg px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
        <Outlet />
      </main>
      <TabBar />
      <UpdatePrompt />
      <InstallGuide />
    </div>
  );
}
