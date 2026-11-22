import clsx from "clsx";
import { NavLink } from "react-router-dom";
import { CalendarIcon, GachaIcon, HomeIcon, MoreIcon, StarIcon } from "./icons";

const TABS = [
  { to: "/", label: "今天", Icon: HomeIcon, end: true },
  { to: "/wishes", label: "願望", Icon: StarIcon },
  { to: "/calendar", label: "行事曆", Icon: CalendarIcon },
  { to: "/gacha", label: "扭蛋", Icon: GachaIcon },
  { to: "/more", label: "更多", Icon: MoreIcon },
];

export function TabBar() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/85 backdrop-blur-lg dark:border-white/10 dark:bg-stone-900/85">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] transition",
                  isActive ? "text-brand-500" : "text-stone-400",
                )
              }
            >
              <Icon className="size-6" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
