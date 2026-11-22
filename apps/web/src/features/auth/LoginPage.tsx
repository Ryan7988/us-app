import { useState, type FormEvent } from "react";
import type { TokenResponse } from "@/api/types";
import { useOnline } from "@/lib/online";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setTokens = useAuth((s) => s.setTokens);
  const online = useOnline();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await res.json().catch(() => ({}))) as TokenResponse & { detail?: string };
      if (!res.ok) {
        setError(body.detail ?? "登入失敗");
        return;
      }
      setTokens(body);
    } catch {
      setError("連不到伺服器：請確認 Tailscale 已經打開 🔌");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-safe flex min-h-full flex-col justify-center px-6">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-6xl">💗</div>
          <h1 className="text-3xl font-bold">我們</h1>
          <p className="mt-1 text-stone-500">只屬於我們兩個人的地方</p>
        </div>
        {!online && (
          <p className="mb-4 rounded-xl bg-amber-100 p-3 text-sm text-amber-800">
            目前離線。請確認網路與 Tailscale 都已開啟。
          </p>
        )}
        <form onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="username">
              帳號
            </label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              密碼
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "登入中…" : "登入"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-stone-400">登入一次，90 天內都不用再登入</p>
      </div>
    </div>
  );
}
