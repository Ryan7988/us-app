import { ComingSoon } from "@/components/ComingSoon";

export function CalendarPage() {
  return (
    <ComingSoon
      title="行事曆"
      emoji="💌"
      items={["我的 / 你的 / 共同行程", "邀請函：寄出、同意後自動進行事曆", "訂閱到 iPhone 行事曆"]}
    />
  );
}
