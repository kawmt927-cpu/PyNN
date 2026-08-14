import { cn } from "@/lib/utils";

export type OctopusMood = "idle" | "thinking" | "cheer" | "wink" | "alert";

const MOOD_LABEL: Record<OctopusMood, string> = {
  idle: "触触",
  thinking: "触触在想",
  cheer: "触触开心",
  wink: "触触眨眼",
  alert: "触触提醒",
};

type AvatarProps = {
  mood?: OctopusMood;
  size?: number;
  className?: string;
  title?: string;
};

/** 管理助手拟人形象：卡通章鱼「触触」 */
export function OctopusAvatar({
  mood = "idle",
  size = 40,
  className,
  title,
}: AvatarProps) {
  const label = title ?? MOOD_LABEL[mood];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className={cn("shrink-0", className)}
    >
      <title>{label}</title>
      {/* soft glow */}
      <circle cx="32" cy="30" r="26" fill="#ffffff" />
      {/* tentacles */}
      <g fill="#0d9488" stroke="#0f766e" strokeWidth="0.8">
        <path d="M18 40c-4 6-8 10-10 14 4-1 8-3 12-7 2-2 3-5 2-7z" />
        <path d="M24 44c-1 7-3 12-6 16 5-1 9-4 12-9 1-3 0-5-1-7z" />
        <path d="M32 46c0 7 0 12 1 16 4-3 6-8 6-13 0-2-1-3-2-3z" />
        <path d="M40 44c1 7 3 12 6 16-5-1-9-4-12-9-1-3 0-5 1-7z" />
        <path d="M46 40c4 6 8 10 10 14-4-1-8-3-12-7-2-2-3-5-2-7z" />
        <ellipse cx="20" cy="52" rx="3.2" ry="2.4" fill="#5eead4" opacity="0.7" />
        <ellipse cx="28" cy="56" rx="3" ry="2.2" fill="#5eead4" opacity="0.7" />
        <ellipse cx="36" cy="56" rx="3" ry="2.2" fill="#5eead4" opacity="0.7" />
        <ellipse cx="44" cy="52" rx="3.2" ry="2.4" fill="#5eead4" opacity="0.7" />
      </g>
      {/* head */}
      <ellipse cx="32" cy="28" rx="18" ry="17" fill="#14b8a6" stroke="#0f766e" strokeWidth="1.2" />
      <ellipse cx="32" cy="24" rx="14" ry="10" fill="#5eead4" opacity="0.35" />
      {/* cheeks */}
      <ellipse cx="20" cy="31" rx="3.2" ry="2.2" fill="#fb7185" opacity="0.55" />
      <ellipse cx="44" cy="31" rx="3.2" ry="2.2" fill="#fb7185" opacity="0.55" />
      {/* eyes + mouth by mood */}
      <OctopusFace mood={mood} />
    </svg>
  );
}

function OctopusFace({ mood }: { mood: OctopusMood }) {
  if (mood === "thinking") {
    return (
      <>
        <ellipse cx="25" cy="26" rx="3.2" ry="3.6" fill="#134e4a" />
        <ellipse cx="39" cy="26" rx="3.2" ry="3.6" fill="#134e4a" />
        <circle cx="26.2" cy="25" r="1.1" fill="#fff" />
        <circle cx="40.2" cy="25" r="1.1" fill="#fff" />
        <path
          d="M28 35c1.5 1.5 6.5 1.5 8 0"
          fill="none"
          stroke="#134e4a"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="48" cy="18" r="1.6" fill="#0f766e" />
        <circle cx="52" cy="14" r="1.2" fill="#0f766e" />
        <circle cx="54.5" cy="10" r="0.9" fill="#0f766e" />
      </>
    );
  }
  if (mood === "cheer") {
    return (
      <>
        <path
          d="M21 27c2-3 6-3 8 0"
          fill="none"
          stroke="#134e4a"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M35 27c2-3 6-3 8 0"
          fill="none"
          stroke="#134e4a"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M26 34c2 3 10 3 12 0"
          fill="none"
          stroke="#134e4a"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M14 14l2 3 3-1-2 3 2 3-3-1-2 3-1-3-3 1 2-3-2-3 3 1z" fill="#fbbf24" />
        <path d="M50 12l1.5 2.2 2.3-.8-1.5 2.2 1.5 2.2-2.3-.8-1.5 2.2-.7-2.2-2.3.8 1.5-2.2-1.5-2.2 2.3.8z" fill="#fbbf24" />
      </>
    );
  }
  if (mood === "wink") {
    return (
      <>
        <ellipse cx="25" cy="26" rx="3.2" ry="3.6" fill="#134e4a" />
        <circle cx="26.2" cy="25" r="1.1" fill="#fff" />
        <path
          d="M36 27c2-2.5 6-2.5 8 0"
          fill="none"
          stroke="#134e4a"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M27 34c2 2.5 8 2.5 10 0"
          fill="none"
          stroke="#134e4a"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </>
    );
  }
  if (mood === "alert") {
    return (
      <>
        <ellipse cx="25" cy="26" rx="3.4" ry="3.8" fill="#134e4a" />
        <ellipse cx="39" cy="26" rx="3.4" ry="3.8" fill="#134e4a" />
        <circle cx="26.3" cy="24.8" r="1.2" fill="#fff" />
        <circle cx="40.3" cy="24.8" r="1.2" fill="#fff" />
        <ellipse cx="32" cy="35" rx="3.5" ry="2.8" fill="#134e4a" />
        <path
          d="M48 12v8"
          stroke="#f59e0b"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="48" cy="24" r="1.4" fill="#f59e0b" />
      </>
    );
  }
  // idle
  return (
    <>
      <ellipse cx="25" cy="26" rx="3.2" ry="3.6" fill="#134e4a" />
      <ellipse cx="39" cy="26" rx="3.2" ry="3.6" fill="#134e4a" />
      <circle cx="26.2" cy="25" r="1.1" fill="#fff" />
      <circle cx="40.2" cy="25" r="1.1" fill="#fff" />
      <path
        d="M27 34c2 2.2 8 2.2 10 0"
        fill="none"
        stroke="#134e4a"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </>
  );
}
