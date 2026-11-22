import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { logout } from "@/lib/auth";
import { isStandalone } from "@/lib/platform";
import { useUsers } from "@/lib/users";

const LINKS = [
  { to: "/more/album", icon: "📷", label: "相簿" },
  { to: "/more/location", icon: "📍", label: "位置與報平安" },
  { to: "/more/settings", icon: "⚙️", label: "設定（通知、紀念日、行事曆訂閱）" },
  { to: "/more/admin", icon: "🛠️", label: "後台" },
];

export function MorePage() {
  const { me } = useUsers();
  const health = useQuery({
    queryKey: ["healthz"],
    queryFn: async () => (await (await fetch("/api/v1/healthz")).json()) as { version: string },
  });
  const backend = health.data?.version;
  const mismatch = backend && backend !== __APP_VERSION__;

  return (
    <>
      <PageHeader title="更多" />
      <section className="card mb-4 flex items-center gap-3">
        <div
          className="flex size-12 items-center justify-center rounded-full text-xl font-bold text-white"
          style={{ background: me?.color }}
        >
          {me?.display_name.slice(0, 1)}
        </div>
        <div className="flex-1">
          <p className="font-semibold">{me?.display_name}</p>
          <p className="text-sm text-stone-400">@{me?.username}</p>
        </div>
      </section>

      <section className="card mb-4 divide-y divide-black/5 p-0 dark:divide-white/10">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 px-4 py-3.5">
            <span>{l.icon}</span>
            <span className="flex-1">{l.label}</span>
            <span className="text-stone-300">›</span>
          </Link>
        ))}
      </section>

      <section className="card mb-4 space-y-1 text-sm">
        <h2 className="mb-2 font-semibold">關於</h2>
        <Row k="App 版本" v={__APP_VERSION__} />
        <Row k="伺服器版本" v={backend ?? "…"} />
        <Row k="開啟方式" v={isStandalone() ? "主畫面 App" : "瀏覽器"} />
        {mismatch && (
          <p className="pt-2 text-amber-600">版本不一致：完全關閉 App 再打開一次就會更新</p>
        )}
      </section>

      <button
        className="btn-ghost w-full text-red-500"
        onClick={() => confirm("確定要登出嗎？") && logout()}
      >
        登出
      </button>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-stone-500">{k}</span>
      <span>{v}</span>
    </div>
  );
}
