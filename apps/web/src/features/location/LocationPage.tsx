import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { timeAgo } from "@/lib/date";
import { useOnline } from "@/lib/online";
import { useUsers } from "@/lib/users";
import { useClearLocations, useLatestLocations, usePostLocation, useSetSharing } from "./api";

const TAOYUAN: [number, number] = [24.99, 121.3];

function pin(color: string, letter: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-weight:700">${letter.replace(/[<>&"]/g, "")}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1)
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export function LocationPage() {
  const { data = [] } = useLatestLocations();
  const { me, byId } = useUsers();
  const post = usePostLocation();
  const setSharing = useSetSharing();
  const clear = useClearLocations();
  const online = useOnline();
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const mine = data.find((x) => x.user_id === me?.id);
  const points = useMemo(
    () =>
      data.flatMap((x) =>
        x.location ? [[x.location.lat, x.location.lng] as [number, number]] : [],
      ),
    [data],
  );

  const checkin = async () => {
    setSent(false);
    await post.mutateAsync({ kind: "checkin", message: msg.trim() || "我很好 💕" });
    setMsg("");
    setSent(true);
  };

  return (
    <>
      <PageHeader
        title="位置與報平安"
        action={
          <Link to="/more" className="text-sm text-brand-500">
            ‹ 更多
          </Link>
        }
      />
      <div className="card mb-4 overflow-hidden p-0">
        <MapContainer
          center={TAOYUAN}
          zoom={11}
          className="h-72 w-full"
          attributionControl
          zoomControl={false}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
            maxZoom={19}
          />
          {data.map(
            (x) =>
              x.location && (
                <Marker
                  key={x.user_id}
                  position={[x.location.lat, x.location.lng]}
                  icon={pin(
                    byId.get(x.user_id)?.color ?? "#999",
                    byId.get(x.user_id)?.display_name.slice(0, 1) ?? "?",
                  )}
                />
              ),
          )}
          <FitBounds points={points} />
        </MapContainer>
      </div>

      <ul className="mb-4 space-y-2">
        {data.map((x) => {
          const u = byId.get(x.user_id);
          return (
            <li key={x.user_id} className="card flex items-center gap-3 py-3">
              <span
                className="flex size-9 items-center justify-center rounded-full font-bold text-white"
                style={{ background: u?.color }}
              >
                {u?.display_name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {u?.display_name}
                  {x.user_id === me?.id && "（我）"}
                </p>
                <p className="text-xs text-stone-500">
                  {x.location
                    ? `位置更新於 ${timeAgo(x.location.recorded_at)}`
                    : x.sharing
                      ? "還沒有位置"
                      : "沒有分享位置"}
                </p>
                {x.last_checkin && (
                  <p className="truncate text-xs text-emerald-600">
                    📍 {timeAgo(x.last_checkin.recorded_at)} 報平安：{x.last_checkin.message}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="card mb-4 space-y-3">
        <h2 className="font-semibold">報平安</h2>
        <input
          className="input"
          placeholder="說一句話，例如：到家了"
          maxLength={200}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          aria-label="報平安訊息"
        />
        <button
          className="btn-primary w-full py-3"
          disabled={!online || post.isPending}
          onClick={checkin}
        >
          {post.isPending ? "定位中…" : "📍 報平安（對方會收到通知）"}
        </button>
        {sent && <p className="text-center text-sm text-emerald-600">已送出 ✓</p>}
        {post.error && <p className="text-sm text-red-500">{post.error.message}</p>}
      </div>

      <div className="card space-y-3 text-sm">
        <label className="flex items-center justify-between">
          <span>
            <span className="font-medium">分享我的位置</span>
            <span className="block text-xs text-stone-500">
              打開 App 時自動更新；位置紀錄只保留 30 天
            </span>
          </span>
          <input
            type="checkbox"
            className="size-5 accent-brand-500"
            checked={mine?.sharing ?? false}
            disabled={!online}
            onChange={(e) => setSharing.mutate(e.target.checked)}
            aria-label="分享我的位置"
          />
        </label>
        <button
          className="text-xs text-red-500"
          onClick={() => confirm("清除我所有的位置紀錄？") && clear.mutate()}
        >
          清除我的位置紀錄
        </button>
        <p className="text-xs text-stone-400">
          PWA 沒辦法在背景定位。想看即時位置，建議同時使用 iPhone 內建「尋找」的位置共享。
        </p>
      </div>
    </>
  );
}
