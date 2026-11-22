import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Rarity } from "@/api/types";
import { RARITY_STYLE } from "./api";
import { GachaMachine } from "./GachaMachine";

type Phase = "shake" | "drop" | "open" | "card";

/** 開獎動畫：轉把手 → 掉蛋 → 開蛋 → 稀有度光效（SSR 金光）→ 卡片 */
export function GachaReveal({
  rarity,
  content,
  pity,
  onClose,
}: {
  rarity: Rarity;
  content: string;
  pity: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("shake");
  const st = RARITY_STYLE[rarity];

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("drop"), 1600);
    const t2 = setTimeout(() => setPhase("open"), 3000);
    const t3 = setTimeout(() => setPhase("card"), rarity === "SSR" ? 4600 : 4000);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [rarity]);

  const skip = () => setPhase("card");

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-stone-950/90 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={phase === "card" ? undefined : skip}
      role="dialog"
      aria-label="開獎"
    >
      <AnimatePresence mode="wait">
        {phase === "shake" && (
          <motion.div key="m" exit={{ y: -40, opacity: 0 }}>
            <GachaMachine shaking size={220} />
            <p className="mt-4 text-center text-white/80">轉轉轉…</p>
          </motion.div>
        )}
        {phase === "drop" && (
          <motion.div
            key="drop"
            initial={{ y: -300 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", bounce: 0.55, duration: 1.2 }}
          >
            <Capsule color={st.color} wobble />
          </motion.div>
        )}
        {phase === "open" && (
          <motion.div key="open" className="relative flex items-center justify-center">
            <Burst color={st.glow} big={rarity === "SSR"} />
            <motion.div
              animate={{ y: -90, rotate: -35, opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute"
            >
              <HalfTop color={st.color} />
            </motion.div>
            <motion.div
              animate={{ y: 90, rotate: 20, opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute"
            >
              <HalfBottom />
            </motion.div>
          </motion.div>
        )}
        {phase === "card" && (
          <motion.div
            key="card"
            className="relative flex w-full max-w-sm flex-col items-center"
            initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
            animate={{ scale: 1, rotateY: 0, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.9 }}
          >
            {rarity === "SSR" && <Rays />}
            <div
              className={`relative w-full rounded-3xl bg-gradient-to-br ${st.bg} p-6 text-center text-stone-800`}
              style={{ boxShadow: `0 0 60px 10px ${st.glow}` }}
            >
              <p
                className="text-5xl font-black tracking-widest"
                style={{ color: st.color, textShadow: "0 2px 0 #fff" }}
              >
                {st.label}
              </p>
              {pity && <p className="mt-1 text-xs font-semibold text-amber-700">✨ 保底觸發！</p>}
              <p className="mt-4 text-xl leading-relaxed font-bold">{content}</p>
              <p className="mt-4 text-sm text-stone-600">這個月一定要一起做到喔 💪</p>
            </div>
            <button className="btn-primary mt-6 px-10" onClick={onClose}>
              收下任務
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {phase !== "card" && <p className="absolute bottom-10 text-xs text-white/40">點一下跳過</p>}
    </motion.div>
  );
}

function Capsule({ color, wobble }: { color: string; wobble?: boolean }) {
  return (
    <motion.svg
      width="140"
      height="140"
      viewBox="0 0 100 100"
      animate={wobble ? { rotate: [0, -12, 12, -8, 8, 0] } : {}}
      transition={{ delay: 0.6, duration: 0.8 }}
    >
      <circle cx="50" cy="50" r="40" fill="#fff" />
      <path d="M10 50 A40 40 0 0 1 90 50 Z" fill={color} />
      <rect x="10" y="47" width="80" height="6" fill="#00000022" />
      <circle cx="36" cy="32" r="7" fill="#fff" opacity="0.6" />
    </motion.svg>
  );
}

function HalfTop({ color }: { color: string }) {
  return (
    <svg width="140" height="70" viewBox="0 0 100 50">
      <path d="M10 50 A40 40 0 0 1 90 50 Z" fill={color} />
    </svg>
  );
}

function HalfBottom() {
  return (
    <svg width="140" height="70" viewBox="0 0 100 50">
      <path d="M10 0 A40 40 0 0 0 90 0 Z" fill="#fff" />
    </svg>
  );
}

function Burst({ color, big }: { color: string; big: boolean }) {
  return (
    <>
      <motion.div
        className="absolute rounded-full"
        style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
        initial={{ width: 40, height: 40, opacity: 1 }}
        animate={{ width: big ? 900 : 500, height: big ? 900 : 500, opacity: 0.9 }}
        transition={{ duration: big ? 1.5 : 1 }}
      />
      {Array.from({ length: big ? 24 : 12 }).map((_, i) => {
        const a = (i / (big ? 24 : 12)) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute size-2 rounded-full bg-white"
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: Math.cos(a) * 180, y: Math.sin(a) * 180, opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
        );
      })}
    </>
  );
}

function Rays() {
  return (
    <motion.div
      className="pointer-events-none absolute -inset-40"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 12, ease: "linear" }}
      style={{
        background:
          "repeating-conic-gradient(from 0deg, rgba(251,191,36,0.35) 0deg 10deg, transparent 10deg 30deg)",
        maskImage: "radial-gradient(circle, black 30%, transparent 70%)",
        WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 70%)",
      }}
    />
  );
}
