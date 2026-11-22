import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { formatDateTime, timeAgo } from "@/lib/date";
import { useUsers } from "@/lib/users";
import { STATUS_LABEL, THEMES, useInvitations } from "./api";
import { InvitationForm } from "./InvitationForm";

export function InvitationsPage() {
  const { data = [], isLoading } = useInvitations();
  const { me, byId } = useUsers();
  const [box, setBox] = useState<"inbox" | "sent">("inbox");
  const [compose, setCompose] = useState(false);
  const list = data.filter((i) =>
    box === "inbox" ? i.to_user === me?.id : i.from_user === me?.id,
  );
  const pending = data.filter((i) => i.to_user === me?.id && i.status === "pending").length;

  return (
    <>
      <PageHeader
        title="邀請函"
        action={
          <Link to="/calendar" className="text-sm text-brand-500">
            ‹ 行事曆
          </Link>
        }
      />
      <div className="mb-4 flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800">
        {(["inbox", "sent"] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBox(b)}
            className={clsx(
              "flex-1 rounded-lg py-1.5 text-sm",
              box === b ? "bg-white font-medium shadow-sm dark:bg-stone-600" : "text-stone-500",
            )}
          >
            {b === "inbox" ? `收件匣${pending ? `（${pending}）` : ""}` : "寄出的"}
          </button>
        ))}
      </div>
      <button className="btn-primary mb-4 w-full" onClick={() => setCompose(true)}>
        💌 寫一封邀請函
      </button>
      {isLoading && <p className="text-center text-stone-400">載入中…</p>}
      {!isLoading && list.length === 0 && (
        <p className="py-10 text-center text-stone-400">
          {box === "inbox" ? "還沒有收到邀請函" : "還沒寄過邀請函"}
        </p>
      )}
      <ul className="space-y-3">
        {list.map((inv) => {
          const other = byId.get(box === "inbox" ? inv.from_user : inv.to_user);
          const t = THEMES[inv.theme] ?? THEMES.rose;
          return (
            <li key={inv.id}>
              <Link
                to={`/calendar/invitations/${inv.id}`}
                className={clsx(
                  "block rounded-2xl bg-gradient-to-br p-4 text-stone-800 shadow-sm",
                  t.bg,
                  inv.status !== "pending" && "opacity-75",
                )}
              >
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span>
                    {box === "inbox"
                      ? `來自 ${other?.display_name}`
                      : `寄給 ${other?.display_name}`}
                    ・{timeAgo(inv.created_at)}
                  </span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5",
                      inv.status === "pending" ? "bg-white/80 font-semibold" : "bg-white/50",
                    )}
                  >
                    {STATUS_LABEL[inv.status]}
                  </span>
                </div>
                <p className="mt-1 text-lg font-bold">
                  {t.emoji} {inv.title}
                </p>
                <p className="text-sm text-stone-600">
                  {inv.status === "accepted" && inv.chosen_slot !== null
                    ? formatDateTime(inv.proposed_slots[inv.chosen_slot].start_at)
                    : inv.proposed_slots.map((s) => formatDateTime(s.start_at)).join(" ／ ")}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      <Sheet open={compose} onClose={() => setCompose(false)} title="寫邀請函">
        {compose && <InvitationForm onDone={() => setCompose(false)} />}
      </Sheet>
    </>
  );
}
