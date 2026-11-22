import { ComingSoon } from "@/components/ComingSoon";

export function GachaPage() {
  return (
    <ComingSoon
      title="扭蛋機"
      emoji="🎰"
      items={["每月 1 號一起抽一張任務卡", "SSR / SR / R 稀有度與保底", "AI 幫忙出題"]}
    />
  );
}
