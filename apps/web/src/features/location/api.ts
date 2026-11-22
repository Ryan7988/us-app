import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, unwrap } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function useLatestLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: () => unwrap(api.GET("/api/v1/locations/latest")),
    refetchInterval: 60_000,
  });
}

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("這台裝置不支援定位"));
    navigator.geolocation.getCurrentPosition(
      resolve,
      (e) =>
        reject(
          new Error(
            e.code === 1 ? "定位權限被拒絕（iPhone 設定 → 隱私權 → 定位服務）" : "暫時無法取得位置",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 },
    );
  });
}

export function usePostLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, message }: { kind: "auto" | "checkin"; message?: string }) => {
      const pos = await getPosition();
      return unwrap(
        api.POST("/api/v1/locations", {
          body: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            kind,
            message: message || null,
          },
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useSetSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      unwrap(api.PUT("/api/v1/locations/sharing", { body: { enabled } })),
    onSuccess: (r) => {
      const s = useAuth.getState();
      if (s.user) useAuth.setState({ user: { ...s.user, location_sharing: r.enabled } });
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}

export function useClearLocations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/locations")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

const LAST_KEY = "last-auto-location";

/** PWA 無法背景定位：打開 App（或回到前景）時更新自己的位置，最多 5 分鐘一次。 */
export function useAutoLocation(): void {
  const sharing = useAuth((s) => s.user?.location_sharing ?? false);
  const qc = useQueryClient();
  useEffect(() => {
    if (!sharing) return;
    const run = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
        if (Date.now() - last < 5 * 60_000) return;
        localStorage.setItem(LAST_KEY, String(Date.now()));
        const pos = await getPosition();
        await api.POST("/api/v1/locations", {
          body: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            kind: "auto",
          },
        });
        qc.invalidateQueries({ queryKey: ["locations"] });
      } catch {
        /* 沒權限就算了 */
      }
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, [sharing, qc]);
}
