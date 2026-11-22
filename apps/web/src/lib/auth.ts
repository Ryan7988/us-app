import { create } from "zustand";
import type { TokenResponse, User } from "@/api/types";

type Status = "loading" | "needs_setup" | "anonymous" | "authenticated";

interface AuthState {
  status: Status;
  accessToken: string | null; // 只放記憶體，不寫入 localStorage
  user: User | null;
  setTokens: (t: TokenResponse) => void;
  setStatus: (s: Status) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  accessToken: null,
  user: null,
  setTokens: (t) => set({ accessToken: t.access_token, user: t.user, status: "authenticated" }),
  setStatus: (status) => set({ status }),
  clear: () => set({ accessToken: null, user: null, status: "anonymous" }),
}));

let refreshing: Promise<boolean> | null = null;

/** 用 HttpOnly cookie 換新的 access token。同時多個請求只會打一次 refresh。 */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch("/api/v1/auth/refresh", { method: "POST" });
        if (!res.ok) {
          useAuth.getState().clear();
          return false;
        }
        useAuth.getState().setTokens((await res.json()) as TokenResponse);
        return true;
      } catch {
        // 網路錯誤（例如沒開 Tailscale）：不要把使用者登出
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/v1/auth/logout", { method: "POST" });
  } finally {
    useAuth.getState().clear();
  }
}
