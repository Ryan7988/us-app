import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatDateTime, formatTime } from "@/lib/date";
import { useOnline } from "@/lib/online";
import { useUsers } from "@/lib/users";
import { STATUS_LABEL, THEMES, useCancelInvitation, useInvitations, useRespond } from "./api";
import { SlotsEditor } from "./InvitationForm";
import { defaultSlot, type SlotDraft, slotsToApi } from "./slots";

/** 邀請函：信封打開 → 信紙滑出的動畫，然後選時間回覆。 */
export function InvitationDetail() {
  const { id } = useParams();
  const { data = [] } = useInvitations();
  const { me, byId } = useUsers();
  const inv = data.find((i) => i.id === id);
  const respond = useRespond();
  const cancel = useCancelInvitation();
  const online = useOnline();
  const [opened, setOpened] = useState(false);
  const [chosen, setChosen] = useState(0);
  const [reply, setReply] = useState("");
  const [countering, setCountering] = useState(false);
  const [counter, setCounter] = useState<SlotDraft[]>([defaultSlot()]);

  if (!inv) return <p className="py-20 text-center text-stone-400">找不到這封邀請函</p>;
  const t = THEMES[inv.theme] ?? THEMES.rose;
  const incoming = inv.to_user === me?.id;
  const from = byId.get(inv.from_user);
  const canRespond = incoming && inv.status === "pending";
  const showLetter = opened || !incoming || inv.status !== "pending";

  const act = async (action: "accept" | "decline" | "counter") => {
    await respond.mutateAsync({
      id: inv.id,
      action,
      chosen_slot: action === "accept" ? chosen : undefined,
      message: reply.trim() || undefined,
      counter_slots: action === "counter" ? slotsToApi(counter) : undefined,
    });
    setCountering(false);
  };

  return (
    <div className="pb-6">
      <Link to="/calendar/invitations" className="text-sm text-brand-500">
        ‹ 邀請函
      </Link>
      <AnimatePresence mode="wait">
        {!showLetter ? (
          <motion.button
            key="envelope"
            onClick={() => setOpened(true)}
            aria-label="打開信封"
            className="relative mx-auto mt-16 block h-52 w-full max-w-sm"
            exit={{ y: 40, opacity: 0 }}
            initial={{ scale: 0.8, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.5 }}
          >
            <div
              className={clsx("absolute inset-0 rounded-2xl bg-gradient-to-br shadow-xl", t.bg)}
            />
            <motion.div
              className="absolute inset-x-0 top-0 h-28 origin-top"
              style={{
                clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                background: t.accent,
                opacity: 0.85,
              }}
              animate={{ rotateX: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-10">
              <span className="text-5xl">{t.emoji}</span>
              <p className="mt-2 font-semibold text-stone-700">{from?.display_name} 寄來的邀請函</p>
              <p className="text-xs text-stone-500">點一下打開</p>
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="letter"
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", bounce: 0.3 }}
            className={clsx(
              "mt-4 rounded-3xl bg-gradient-to-br p-6 text-stone-800 shadow-xl",
              t.bg,
            )}
          >
            <p className="text-xs text-stone-600">
              {incoming
                ? `來自 ${from?.display_name}`
                : `寄給 ${byId.get(inv.to_user)?.display_name}`}
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {t.emoji} {inv.title}
            </h1>
            {inv.message && (
              <p className="mt-3 whitespace-pre-wrap leading-relaxed">{inv.message}</p>
            )}
            {inv.location && <p className="mt-3 text-sm">📍 {inv.location}</p>}
            <div className="mt-4 space-y-2">
              {inv.proposed_slots.map((s, i) => {
                const picked = inv.status === "accepted" ? inv.chosen_slot === i : chosen === i;
                return (
                  <button
                    key={i}
                    disabled={!canRespond}
                    onClick={() => setChosen(i)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-xl bg-white/70 px-4 py-3 text-left transition",
                      picked && "ring-2",
                      !canRespond && !picked && "opacity-50",
                    )}
                    style={picked ? { ["--tw-ring-color" as string]: t.accent } : {}}
                  >
                    <span
                      className={clsx("size-4 rounded-full border-2", picked && "border-[5px]")}
                      style={{ borderColor: t.accent }}
                    />
                    <span>
                      {formatDateTime(s.start_at)} – {formatTime(s.end_at)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-center text-sm font-medium">{STATUS_LABEL[inv.status]}</p>
            {inv.response_message && (
              <p className="mt-1 text-center text-sm text-stone-600">「{inv.response_message}」</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {canRespond && showLetter && (
        <div className="mt-5 space-y-3">
          <input
            className="input"
            placeholder="回一句話（可不填）"
            maxLength={500}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            aria-label="回覆"
          />
          {countering ? (
            <div className="card space-y-3">
              <p className="text-sm font-medium">提議其他時間</p>
              <SlotsEditor slots={counter} onChange={setCounter} />
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => setCountering(false)}>
                  取消
                </button>
                <button
                  className="btn-primary flex-1"
                  disabled={!online || respond.isPending}
                  onClick={() => act("counter")}
                >
                  送出
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                className="btn-primary w-full py-3 text-lg"
                disabled={!online || respond.isPending}
                onClick={() => act("accept")}
              >
                答應 💕
              </button>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => setCountering(true)}>
                  提議其他時間
                </button>
                <button
                  className="btn-ghost flex-1 text-stone-500"
                  disabled={!online || respond.isPending}
                  onClick={() => act("decline")}
                >
                  婉拒
                </button>
              </div>
            </>
          )}
          {respond.error && <p className="text-sm text-red-500">{respond.error.message}</p>}
        </div>
      )}
      {!incoming && inv.status === "pending" && (
        <button
          className="btn-ghost mt-4 w-full text-stone-500"
          onClick={() => confirm("收回這封邀請函？") && cancel.mutate(inv.id)}
        >
          收回邀請
        </button>
      )}
      {inv.status === "accepted" && (
        <Link to="/calendar" className="btn-ghost mt-4 w-full">
          已加入共同行事曆 → 查看
        </Link>
      )}
    </div>
  );
}
