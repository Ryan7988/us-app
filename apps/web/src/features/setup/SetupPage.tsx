import { useState, type FormEvent } from "react";
import type { SetupUser } from "@/api/types";
import { useAuth } from "@/lib/auth";

const EMPTY: SetupUser[] = [
  { username: "", display_name: "", password: "", color: "#60a5fa" },
  { username: "", display_name: "", password: "", color: "#f472b6" },
];

/** 首次啟動：建立兩個帳號，建完永久關閉。 */
export function SetupPage() {
  const [users, setUsers] = useState<SetupUser[]>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setStatus = useAuth((s) => s.setStatus);

  const update = (i: number, patch: Partial<SetupUser>) =>
    setUsers((prev) => prev.map((u, j) => (j === i ? { ...u, ...patch } : u)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users }),
      });
      if (res.status === 201 || res.status === 409) {
        setStatus("anonymous");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
      setError(
        typeof body.detail === "string"
          ? body.detail
          : "請確認：帳號只能用英數字、密碼至少 8 個字、兩個帳號不能相同",
      );
    } catch {
      setError("連不到伺服器");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-safe mx-auto max-w-md px-5 py-8">
      <div className="mb-6 text-center">
        <div className="mb-2 text-5xl">💞</div>
        <h1 className="text-2xl font-bold">歡迎！先建立我們的帳號</h1>
        <p className="mt-1 text-sm text-stone-500">只需要做一次，建完這頁就會永久關閉</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {users.map((u, i) => (
          <fieldset key={i} className="card space-y-3">
            <legend className="sr-only">{i === 0 ? "第一個人" : "第二個人"}</legend>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{i === 0 ? "第一個人" : "第二個人"}</span>
              <label className="flex items-center gap-2 text-sm text-stone-500">
                代表色
                <input
                  type="color"
                  value={u.color}
                  onChange={(e) => update(i, { color: e.target.value })}
                  className="size-7 rounded-full border-0 bg-transparent"
                />
              </label>
            </div>
            <div>
              <label className="label" htmlFor={`dn${i}`}>
                暱稱（顯示在 App 裡）
              </label>
              <input
                id={`dn${i}`}
                className="input"
                required
                maxLength={32}
                value={u.display_name}
                onChange={(e) => update(i, { display_name: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor={`un${i}`}>
                登入帳號（英數字）
              </label>
              <input
                id={`un${i}`}
                className="input"
                required
                minLength={2}
                maxLength={32}
                pattern="[a-zA-Z0-9_.\-]+"
                autoCapitalize="none"
                autoCorrect="off"
                value={u.username}
                onChange={(e) => update(i, { username: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor={`pw${i}`}>
                密碼（至少 8 個字）
              </label>
              <input
                id={`pw${i}`}
                className="input"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={u.password}
                onChange={(e) => update(i, { password: e.target.value })}
              />
            </div>
          </fieldset>
        ))}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "建立中…" : "建立帳號"}
        </button>
      </form>
    </div>
  );
}
