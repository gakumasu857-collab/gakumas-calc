import type { ComponentType, ReactNode } from "react";
import {
  Check,
  Gift,
  GraduationCap,
  MapPin,
  MessagesSquare,
  Music,
  School,
  Sparkles,
  Store,
  Trophy,
} from "lucide-react";
import type { CalendarEvent } from "@/data/scheduleCalendar";

type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

/**
 * スケジュールの行動ごとのカードの見た目（正方形のアイコン＋名前）。
 * Tailwind がクラス名を拾えるよう、色は完成形の文字列で持つ（${...} と隣接させない）。
 */
export const EVENT_CARD: Record<
  CalendarEvent | "exam",
  { label: string; grad: string; ring: string; icon: IconType }
> = {
  // レッスンは普通のものとスター性重視（☆）で同じ色。アイコンと名前で見分ける
  lesson: { label: "レッスン", grad: "from-sky-400 to-blue-500", ring: "ring-blue-500", icon: Music },
  starLesson: {
    label: "☆レッスン",
    grad: "from-sky-400 to-blue-500",
    ring: "ring-blue-500",
    icon: Sparkles,
  },
  // 授業と営業は同じ紫。アイコンと名前で見分ける
  class: { label: "授業", grad: "from-violet-400 to-purple-600", ring: "ring-purple-500", icon: School },
  sale: { label: "営業", grad: "from-violet-400 to-purple-600", ring: "ring-purple-500", icon: Store },
  date: { label: "おでかけ", grad: "from-cyan-300 to-teal-500", ring: "ring-teal-500", icon: MapPin },
  meeting: {
    label: "相談",
    grad: "from-emerald-300 to-green-500",
    ring: "ring-green-500",
    icon: MessagesSquare,
  },
  // 名前はシナリオで変わる（差し入れ／活動支給。supplyLabel）ので、使う側が label で渡す
  supply: { label: "差し入れ", grad: "from-amber-400 to-orange-500", ring: "ring-orange-500", icon: Gift },
  lecture: {
    label: "特別指導",
    grad: "from-lime-500 to-green-700",
    ring: "ring-green-700",
    icon: GraduationCap,
  },
  exam: { label: "試験", grad: "from-rose-400 to-red-600", ring: "ring-red-500", icon: Trophy },
};

/**
 * スケジュールの正方形カード1枚。
 * selected を渡すと選択肢として表示する（選ばれていないものは薄く、選ばれたものは枠とチェック）。
 * onClick が無ければ押せない表示だけのカード。
 */
export function ScheduleCard({
  kind,
  selected,
  onClick,
  sub,
  size = "md",
  title,
  label,
}: {
  kind: CalendarEvent | "exam";
  selected?: boolean;
  onClick?: () => void;
  /** 名前を差し替える（差し入れ／活動支給などシナリオで呼び名が変わるもの） */
  label?: string;
  /** 名前の下に添える小さな表示（差し入れのPポイントなど） */
  sub?: ReactNode;
  /** md: 選択画面（幅いっぱい）／sm: スケジュール表（小さめ固定幅） */
  size?: "md" | "sm";
  title?: string;
}) {
  const s = EVENT_CARD[kind];
  const Icon = s.icon;
  const dim = selected === false;
  const box = size === "sm" ? "w-12 rounded-xl" : "w-full rounded-2xl";
  const ring = selected ? `ring-4 ring-offset-2 ${s.ring}` : "";
  const fade = dim ? "opacity-35 saturate-50 group-hover:opacity-80" : "";
  const body = (
    <>
      <span
        className={`relative flex aspect-square items-center justify-center bg-linear-to-br text-white shadow-sm transition ${box} ${s.grad} ${ring} ${fade}`}
      >
        <Icon size={size === "sm" ? 20 : 26} strokeWidth={2.2} />
        {selected && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-600 shadow">
            <Check size={13} strokeWidth={3} />
          </span>
        )}
      </span>
      <span
        className={`w-full truncate text-center font-bold leading-tight ${
          size === "sm" ? "text-[10px]" : "text-[11px]"
        } ${dim ? "text-slate-400" : "text-slate-800"}`}
      >
        {label ?? s.label}
      </span>
      {sub}
    </>
  );
  const wrap = `group flex min-w-0 flex-col items-center gap-1 ${size === "sm" ? "w-14" : ""}`;
  if (!onClick) {
    return (
      <div className={wrap} title={title}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={`${wrap} rounded-2xl p-0.5 transition`}
    >
      {body}
    </button>
  );
}
