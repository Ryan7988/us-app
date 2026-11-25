import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { useAuth } from "./auth";

type WsStatus = "connecting" | "open" | "closed";
export const useWsStatus = create<{ status: WsStatus }>(() => ({ status: "closed" }));

/** WebSocket 事件 → 要 invalidate 的 query key */
const INVALIDATE: Record<string, string[][]> = {
  "wish.changed": [["wishes"]],
  "event.changed": [["events"]],
  "invitation.received": [["invitations"]],
  "invitation.responded": [["invitations"], ["events"]],
  "gacha.ready": [["gacha"]],
  "gacha.drawn": [["gacha"]],
  "gacha.reroll": [["gacha"]],
  "photo.added": [["photos"], ["albums"]],
  "location.updated": [["locations"]],
};

/** 讓頁面可以監聽特定事件（例如扭蛋開獎動畫要兩支手機同時播放） */
type Listener = (type: string, data: Record<string, unknown>) => void;
const listeners = new Set<Listener>();
export function onRealtime(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** App 開著時保持 WebSocket；iOS 進背景會斷線，回前景自動重連並重抓資料。 */
export function useRealtime(): void {
  const qc = useQueryClient();
  const token = useAuth((s) => s.accessToken);
  const hasToken = token !== null;

  useEffect(() => {
    if (!hasToken) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      const t = useAuth.getState().accessToken;
      if (stopped || !t) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/v1/ws?token=${encodeURIComponent(t)}`);
      useWsStatus.setState({ status: "connecting" });

      ws.onopen = () => {
        // 每次連上（含第一次與重連）都重抓：斷線期間的事件不會補送
        qc.invalidateQueries();
        retry = 0;
        useWsStatus.setState({ status: "open" });
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as {
            type: string;
            data: Record<string, unknown>;
          };
          for (const key of INVALIDATE[msg.type] ?? []) qc.invalidateQueries({ queryKey: key });
          for (const fn of listeners) fn(msg.type, msg.data ?? {});
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        useWsStatus.setState({ status: "closed" });
        if (stopped) return;
        const delay = Math.min(30_000, 1000 * 2 ** retry++);
        timer = setTimeout(connect, delay);
      };
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && ws?.readyState !== WebSocket.OPEN) {
        clearTimeout(timer);
        retry = Math.max(retry, 1);
        ws?.close();
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      ws?.close();
    };
  }, [hasToken, qc]);
}
