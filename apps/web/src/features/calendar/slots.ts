import { addDays, fromLocalInput, taipeiDateKey } from "@/lib/date";

export interface SlotDraft {
  start: string; // datetime-local
  hours: number;
}

export function slotsToApi(slots: SlotDraft[]) {
  return slots.map((s) => {
    const start = fromLocalInput(s.start);
    return {
      start_at: start,
      end_at: new Date(new Date(start).getTime() + s.hours * 3600_000).toISOString(),
    };
  });
}

export function defaultSlot(): SlotDraft {
  return { start: `${addDays(taipeiDateKey(new Date()), 1)}T19:00`, hours: 2 };
}
