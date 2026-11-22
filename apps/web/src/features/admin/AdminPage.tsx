import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { GachaSettings, Rarity } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";
import {
  RARITY_STYLE,
  useGachaSettings,
  useSaveGachaSettings,
  useSimulate,
} from "@/features/gacha/api";
import { api, unwrap } from "@/lib/api";
import { timeAgo } from "@/lib/date";

const fmtBytes = (n: number) =>
  n > 1e9
    ? `${(n / 1e9).toFixed(1)} GB`
    : n > 1e6
      ? `${(n / 1e6).toFixed(1)} MB`
      : `${Math.round(n / 1e3)} KB`;

interface Health {
  api: { ok: boolean; version: string };
  db: { ok: boolean; detail: string };
  worker: {
    ok: boolean;
    heartbeat_at: string | null;
    jobs: Record<string, { at: string; ok: boolean; message: string }>;
  };
  ollama: {
    reachable: boolean;
    models: string[];
    chat_model_ready?: boolean;
    embed_model_ready?: boolean;
  };
  websocket_online: string[];
}

/** 後台：取代手動下指令 */
export function AdminPage() {
  return (
    <>
      <PageHeader
        title="後台"
        action={
          <Link to="/more" className="text-sm text-brand-500">
            ‹ 更多
          </Link>
        }
      />
      <div className="space-y-4">
        <HealthSection />
        <StatsSection />
        <BackupSection />
        <GachaSection />
        <AiSection />
        <ErrorsSection />
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={clsx("inline-block size-2.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")}
    />
  );
}

function HealthSection() {
  const q = useQuery({
    queryKey: ["admin", "health"],
    queryFn: async () => (await unwrap(api.GET("/api/v1/admin/health"))) as unknown as Health,
    refetchInterval: 30_000,
  });
  const h = q.data;
  return (
    <Card title="🩺 服務狀態">
      {!h ? (
        <p className="text-sm text-stone-400">載入中…</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <Dot ok={h.api.ok} /> API{" "}
            <span className="ml-auto text-stone-400">v{h.api.version}</span>
          </li>
          <li className="flex items-center gap-2">
            <Dot ok={h.db.ok} /> 資料庫{" "}
            <span className="ml-auto text-stone-400">{h.db.detail}</span>
          </li>
          <li className="flex items-center gap-2">
            <Dot ok={h.worker.ok} /> 排程器{" "}
            <span className="ml-auto text-stone-400">
              {h.worker.heartbeat_at ? timeAgo(h.worker.heartbeat_at) : "沒有心跳"}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Dot ok={h.ollama.reachable && !!h.ollama.chat_model_ready} /> AI（Ollama）
            <span className="ml-auto text-stone-400">
              {!h.ollama.reachable
                ? "連不到"
                : h.ollama.chat_model_ready
                  ? "模型就緒"
                  : "模型未下載"}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Dot ok /> 即時連線{" "}
            <span className="ml-auto text-stone-400">{h.websocket_online.length} 人在線</span>
          </li>
        </ul>
      )}
      {h && Object.keys(h.worker.jobs).length > 0 && (
        <details className="text-xs text-stone-500">
          <summary>排程最後執行</summary>
          <ul className="mt-2 space-y-1">
            {Object.entries(h.worker.jobs).map(([k, v]) => (
              <li key={k} className="flex gap-2">
                <Dot ok={v.ok} /> {k}
                <span className="ml-auto">{timeAgo(v.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function StatsSection() {
  const q = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/stats")),
  });
  const s = q.data as
    | undefined
    | {
        disk: { total: number; free: number; free_ratio: number };
        photos: { count: number; originals_bytes: number };
        db_bytes: number;
        wishes: number;
        cards: number;
        push_devices: number;
      };
  if (!s)
    return (
      <Card title="💾 用量">
        <p className="text-sm text-stone-400">載入中…</p>
      </Card>
    );
  const used = 1 - s.disk.free_ratio;
  return (
    <Card title="💾 用量">
      <div>
        <div className="mb-1 flex justify-between text-xs text-stone-500">
          <span>磁碟</span>
          <span>
            剩 {fmtBytes(s.disk.free)} / {fmtBytes(s.disk.total)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
          <div
            className={clsx("h-full", s.disk.free_ratio < 0.1 ? "bg-red-500" : "bg-brand-500")}
            style={{ width: `${used * 100}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <p className="font-bold">{s.photos.count}</p>
          <p className="text-xs text-stone-500">照片（{fmtBytes(s.photos.originals_bytes)}）</p>
        </div>
        <div>
          <p className="font-bold">{fmtBytes(s.db_bytes)}</p>
          <p className="text-xs text-stone-500">資料庫</p>
        </div>
        <div>
          <p className="font-bold">{s.push_devices}</p>
          <p className="text-xs text-stone-500">通知裝置</p>
        </div>
      </div>
      <RebuildButton />
    </Card>
  );
}

function RebuildButton() {
  const m = useMutation({ mutationFn: () => unwrap(api.POST("/api/v1/admin/media/rebuild")) });
  return (
    <button className="text-xs text-stone-500" disabled={m.isPending} onClick={() => m.mutate()}>
      {m.isPending
        ? "處理中…"
        : m.data
          ? `重建了 ${m.data.rebuilt} 張縮圖`
          : "重新產生縮圖（還原備份後用）"}
    </button>
  );
}

function BackupSection() {
  const q = useQuery({
    queryKey: ["admin", "backups"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/backups")),
  });
  const data = q.data as
    | undefined
    | {
        backups: { status: string; finished_at: string; message: string }[];
        verify: { kind: string; status: string; at: string; message: string }[];
      };
  return (
    <Card title="🗄️ 備份">
      {!data?.backups.length ? (
        <p className="text-sm text-amber-600">還沒有備份紀錄（每天 03:30 自動備份）</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {data.backups.map((b, i) => (
            <li key={i} className="flex gap-2">
              <Dot ok={b.status === "ok"} />
              <span>{timeAgo(b.finished_at)}</span>
              <span className="ml-auto truncate text-stone-400">{b.message}</span>
            </li>
          ))}
        </ul>
      )}
      {!!data?.verify.length && (
        <ul className="space-y-1 border-t border-black/5 pt-2 text-xs dark:border-white/10">
          {data.verify.slice(0, 4).map((v, i) => (
            <li key={i} className="flex gap-2">
              <Dot ok={v.status === "ok"} />
              {v.kind === "check" ? "完整性檢查" : "還原演練"}
              <span className="ml-auto truncate text-stone-400">
                {timeAgo(v.at)}・{v.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GachaSection() {
  const q = useGachaSettings();
  const save = useSaveGachaSettings();
  const sim = useSimulate();
  const [draft, setDraft] = useState<GachaSettings | null>(null);
  const s = draft ?? q.data;
  if (!s) return null;
  const set = (patch: Partial<GachaSettings>) => setDraft({ ...s, ...patch });
  const sum = Object.values(s.rarity_weights).reduce((a, b) => a + b, 0);
  return (
    <Card title="🎰 扭蛋機率">
      {(["SSR", "SR", "R"] as Rarity[]).map((r) => (
        <label key={r} className="flex items-center gap-3 text-sm">
          <span className="w-10 font-bold" style={{ color: RARITY_STYLE[r].color }}>
            {r}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            className="flex-1 accent-brand-500"
            value={Math.round((s.rarity_weights[r] ?? 0) * 100)}
            onChange={(e) =>
              set({ rarity_weights: { ...s.rarity_weights, [r]: Number(e.target.value) / 100 } })
            }
            aria-label={`${r} 機率`}
          />
          <span className="w-12 text-right tabular-nums">
            {Math.round((s.rarity_weights[r] ?? 0) * 100)}%
          </span>
        </label>
      ))}
      {Math.abs(sum - 1) > 0.001 && (
        <p className="text-xs text-red-500">加總要是 100%（目前 {Math.round(sum * 100)}%）</p>
      )}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>
          保底次數
          <input
            type="number"
            min={0}
            max={50}
            className="input mt-1"
            value={s.pity_threshold}
            onChange={(e) => set({ pity_threshold: Number(e.target.value) })}
          />
        </label>
        <label>
          自己寫的卡權重
          <input
            type="number"
            min={0.1}
            step={0.1}
            className="input mt-1"
            value={s.source_weights.custom ?? 2}
            onChange={(e) =>
              set({ source_weights: { ...s.source_weights, custom: Number(e.target.value) } })
            }
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={!draft || Math.abs(sum - 1) > 0.001 || save.isPending}
          onClick={async () => {
            await save.mutateAsync(s);
            setDraft(null);
          }}
        >
          {save.isSuccess && !draft ? "已儲存 ✓" : "儲存"}
        </button>
        <button
          className="btn-ghost flex-1 ring-1 ring-black/10"
          disabled={sim.isPending}
          onClick={() => sim.mutate(10000)}
        >
          模擬 10,000 次
        </button>
      </div>
      {sim.error && <p className="text-xs text-red-500">{sim.error.message}</p>}
      {sim.data && (
        <div className="space-y-1.5">
          {(["SSR", "SR", "R"] as Rarity[]).map((r) => (
            <div key={r} className="flex items-center gap-2 text-xs">
              <span className="w-8 font-bold" style={{ color: RARITY_STYLE[r].color }}>
                {r}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100 dark:bg-stone-700">
                <div
                  className="h-full"
                  style={{
                    width: `${(sim.data.rarity[r] ?? 0) * 100}%`,
                    background: RARITY_STYLE[r].color,
                  }}
                />
              </div>
              <span className="w-14 text-right tabular-nums">
                {((sim.data.rarity[r] ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
          <p className="text-xs text-stone-500">
            含保底的實際 SSR 機率 {((sim.data.rarity.SSR ?? 0) * 100).toFixed(1)}%，保底觸發{" "}
            {(sim.data.pity_rate * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </Card>
  );
}

function AiSection() {
  const pull = useMutation({ mutationFn: () => unwrap(api.POST("/api/v1/admin/ai/pull")) });
  const gen = useMutation({
    mutationFn: () =>
      unwrap(api.POST("/api/v1/admin/ai/generate", { params: { query: { n: 10 } } })),
  });
  return (
    <Card title="🤖 AI 出題">
      <p className="text-xs text-stone-500">
        第一次使用要先下載模型（約 5 GB，可能要十幾分鐘）。每月 20 號會自動補卡。
      </p>
      <div className="flex gap-2">
        <button
          className="btn-ghost flex-1 ring-1 ring-black/10"
          disabled={pull.isPending}
          onClick={() => pull.mutate()}
        >
          {pull.isSuccess ? "下載中（背景）" : "下載 AI 模型"}
        </button>
        <button
          className="btn-primary flex-1"
          disabled={gen.isPending}
          onClick={() => gen.mutate()}
        >
          {gen.isSuccess ? "產生中，完成會通知" : "產生 10 張新卡"}
        </button>
      </div>
      {(pull.error || gen.error) && (
        <p className="text-xs text-red-500">{(pull.error ?? gen.error)?.message}</p>
      )}
    </Card>
  );
}

function ErrorsSection() {
  const q = useQuery({
    queryKey: ["admin", "errors"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/errors")),
  });
  if (!q.data?.length)
    return (
      <Card title="🐞 錯誤紀錄">
        <p className="text-sm text-stone-400">沒有錯誤 🎉</p>
      </Card>
    );
  return (
    <Card title="🐞 錯誤紀錄">
      <ul className="space-y-1 text-xs">
        {q.data.map((e) => (
          <li key={e.id} className="truncate">
            <span className="text-stone-400">{timeAgo(e.created_at)}</span> {e.method} {e.path} —{" "}
            {e.error}
          </li>
        ))}
      </ul>
    </Card>
  );
}
