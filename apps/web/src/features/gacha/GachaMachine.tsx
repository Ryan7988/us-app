import { motion } from "framer-motion";

const CAPSULES = [
  { x: 70, y: 92, c: "#f9a8d4" },
  { x: 100, y: 100, c: "#fcd34d" },
  { x: 130, y: 90, c: "#93c5fd" },
  { x: 85, y: 70, c: "#c4b5fd" },
  { x: 117, y: 68, c: "#86efac" },
  { x: 100, y: 48, c: "#fda4af" },
  { x: 62, y: 62, c: "#fdba74" },
  { x: 140, y: 62, c: "#a5f3fc" },
];

/** 扭蛋機插圖；shaking=true 時轉動把手、膠囊亂跳 */
export function GachaMachine({
  shaking = false,
  size = 220,
}: {
  shaking?: boolean;
  size?: number;
}) {
  return (
    <motion.svg
      viewBox="0 0 200 260"
      width={size}
      height={size * 1.3}
      aria-hidden
      animate={shaking ? { rotate: [0, -3, 3, -3, 3, 0] } : { rotate: 0 }}
      transition={shaking ? { repeat: Infinity, duration: 0.5 } : {}}
    >
      <defs>
        <radialGradient id="dome" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fce7f3" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="80" r="70" fill="#fdf2f8" stroke="#f9a8d4" strokeWidth="4" />
      {CAPSULES.map((p, i) => (
        <motion.g
          key={i}
          animate={shaking ? { x: [0, (i % 3) * 6 - 6, 0], y: [0, -10 - (i % 4) * 4, 0] } : {}}
          transition={{ repeat: Infinity, duration: 0.35 + (i % 3) * 0.1 }}
        >
          <circle cx={p.x} cy={p.y} r="15" fill={p.c} />
          <path
            d={`M ${p.x - 15} ${p.y} A 15 15 0 0 0 ${p.x + 15} ${p.y} Z`}
            fill="#fff"
            opacity="0.7"
          />
        </motion.g>
      ))}
      <circle cx="100" cy="80" r="70" fill="url(#dome)" />
      <rect x="40" y="140" width="120" height="100" rx="18" fill="#ec4899" />
      <rect x="40" y="140" width="120" height="16" rx="8" fill="#db2777" />
      <rect x="78" y="200" width="44" height="28" rx="8" fill="#9d174d" />
      <motion.g
        style={{ originX: "100px", originY: "175px" }}
        animate={shaking ? { rotate: 360 } : { rotate: 0 }}
        transition={shaking ? { repeat: Infinity, duration: 0.8, ease: "linear" } : {}}
      >
        <circle cx="100" cy="175" r="16" fill="#fdf2f8" />
        <rect x="96" y="161" width="8" height="28" rx="4" fill="#f472b6" />
      </motion.g>
    </motion.svg>
  );
}
