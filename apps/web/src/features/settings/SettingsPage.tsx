import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/date";
import { isStandalone } from "@/lib/platform";
import { enablePush, pushPermission } from "@/lib/push";
import { useAppSettings } from "./api";

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="設定"
        action={
          <Link to="/more" className="text-sm text-brand-500">
            ‹ 更多
          </Link>
        }
      />
      <div className="space-y-4">
        <PushSection />
        <ProfileSection />
        <AnniversarySection />
        <IcsSection />
        <PasswordSection />
        <SessionsSection />
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function PushSection() {
  const status = useQuery({
    queryKey: ["push-status"],
    queryFn: () => unwrap(api.GET("/api/v1/push/status")),
  });
  const [perm, setPerm] = useState(pushPermission());
  const [msg, setMsg] = useState<string | null>(null);
  const enable = useMutation({
    mutationFn: enablePush,
    onSuccess: () => {
      setPerm(pushPermission());
      status.refetch();
      setMsg("通知已開啟 ✓");
    },
    onError: (e) => {
      setPerm(pushPermission());
      setMsg((e as Error).message);
    },
  });
  const test = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/push/test")),
    onSuccess: (r) =>
      setMsg(r.sent ? `已送出測試通知到 ${r.sent} 台裝置` : "沒有送出（這台裝置還沒開啟通知）"),
  });
  return (
    <Section title="🔔 通知">
      {!isStandalone() && /iPhone|iPad/.test(navigator.userAgent) && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          iPhone 要從「主畫面」的 App 打開才能開啟通知。
        </p>
      )}
      <p className="text-sm text-stone-500">
        {perm === "granted"
          ? "這台裝置已允許通知"
          : perm === "denied"
            ? "通知被拒絕了，請到 iPhone 設定 → 通知 → 我們 打開"
            : perm === "unsupported"
              ? "這個瀏覽器不支援通知"
              : "還沒開啟"}
        {status.data && `・已登記 ${status.data.devices} 台裝置`}
      </p>
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={enable.isPending || perm === "unsupported"}
          onClick={() => enable.mutate()}
        >
          {perm === "granted" ? "重新登記這台裝置" : "開啟通知"}
        </button>
        <button
          className="btn-ghost ring-1 ring-black/10"
          disabled={test.isPending}
          onClick={() => test.mutate()}
        >
          測試
        </button>
      </div>
      {msg && <p className="text-sm text-stone-600">{msg}</p>}
    </Section>
  );
}

function ProfileSection() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [name, setName] = useState(user?.display_name ?? "");
  const [color, setColor] = useState(user?.color ?? "#f472b6");
  const save = useMutation({
    mutationFn: () =>
      unwrap(api.PATCH("/api/v1/auth/me", { body: { display_name: name.trim(), color } })),
    onSuccess: (u) => {
      useAuth.setState({ user: u });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
  return (
    <Section title="👤 個人資料">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="size-10 rounded-full border-0 bg-transparent"
          aria-label="代表色"
        />
        <input
          className="input flex-1"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          aria-label="暱稱"
        />
      </div>
      <button
        className="btn-primary w-full"
        disabled={save.isPending || !name.trim()}
        onClick={() => save.mutate()}
      >
        {save.isSuccess ? "已儲存 ✓" : "儲存"}
      </button>
    </Section>
  );
}

function AnniversarySection() {
  const s = useAppSettings();
  const qc = useQueryClient();
  const [date, setDate] = useState<string | null>(null);
  const value = date ?? s.data?.anniversary ?? "";
  const save = useMutation({
    mutationFn: () =>
      unwrap(api.PATCH("/api/v1/settings", { body: { anniversary: value || null } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
  return (
    <Section title="💞 交往紀念日">
      <input
        type="date"
        className="input"
        value={value}
        onChange={(e) => setDate(e.target.value)}
        aria-label="紀念日"
      />
      <button
        className="btn-primary w-full"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isSuccess ? "已儲存 ✓" : "儲存"}
      </button>
    </Section>
  );
}

function IcsSection() {
  const link = useQuery({ queryKey: ["ics"], queryFn: () => unwrap(api.GET("/api/v1/ics/link")) });
  const qc = useQueryClient();
  const rotate = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/ics/link/rotate")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ics"] }),
  });
  const [copied, setCopied] = useState(false);
  const url = link.data ? `${location.origin}${link.data.path}` : "";
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <Section title="📅 訂閱到 iPhone 行事曆">
      <p className="text-sm text-stone-500">
        我們的行程會出現在 iPhone 內建的行事曆（每小時更新，需要 Tailscale 開著）。
      </p>
      <a href={webcal} className="btn-primary w-full">
        加入 iPhone 行事曆
      </a>
      <button
        className="btn-ghost w-full ring-1 ring-black/10"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
      >
        {copied ? "已複製 ✓" : "複製訂閱網址"}
      </button>
      <button
        className="text-xs text-stone-400"
        onClick={() => confirm("重新產生後，舊的訂閱會失效，確定？") && rotate.mutate()}
      >
        重新產生網址
      </button>
    </Section>
  );
}

function PasswordSection() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/auth/password", { body: { current_password: cur, new_password: next } }),
      ),
    onSuccess: () => {
      setCur("");
      setNext("");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate();
  };
  return (
    <Section title="🔑 修改密碼">
      <form onSubmit={submit} className="space-y-2">
        <input
          type="password"
          className="input"
          placeholder="目前的密碼"
          autoComplete="current-password"
          required
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          aria-label="目前的密碼"
        />
        <input
          type="password"
          className="input"
          placeholder="新密碼（至少 8 個字）"
          autoComplete="new-password"
          minLength={8}
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-label="新密碼"
        />
        {change.error && <p className="text-sm text-red-500">{change.error.message}</p>}
        <button className="btn-primary w-full" disabled={change.isPending}>
          {change.isSuccess ? "已修改 ✓" : "修改密碼"}
        </button>
      </form>
    </Section>
  );
}

function SessionsSection() {
  const q = useQuery({
    queryKey: ["sessions"],
    queryFn: () => unwrap(api.GET("/api/v1/auth/sessions")),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/api/v1/auth/sessions/{session_id}", { params: { path: { session_id: id } } }),
      ),
    onSuccess: () => q.refetch(),
  });
  return (
    <Section title="📱 登入中的裝置">
      <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
        {(q.data ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2">
            <span className="flex-1">
              {s.device_name}
              {s.current && <span className="ml-1 text-xs text-emerald-600">（這台）</span>}
              <span className="block text-xs text-stone-400">登入於 {timeAgo(s.created_at)}</span>
            </span>
            {!s.current && (
              <button
                className="text-xs text-red-500"
                onClick={() => confirm("強制登出這台裝置？") && revoke.mutate(s.id)}
              >
                登出
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
