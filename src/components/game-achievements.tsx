"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";

import type { GameAchievement } from "@/lib/games";

type GameAchievementsProps = {
  accent: string;
  achievements: readonly GameAchievement[];
  gameId: string;
  loginHref: string;
};

export function GameAchievements({
  accent,
  achievements,
  gameId,
  loginHref,
}: GameAchievementsProps) {
  // undefined = loading, null = logged out
  const [unlocked, setUnlocked] = useState<Set<string> | null>();

  useEffect(() => {
    fetch(`/api/me/achievements?game_id=${gameId}`, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { unlocked: { key: string }[] } | null) =>
        setUnlocked(body ? new Set(body.unlocked.map((entry) => entry.key)) : null),
      )
      .catch(() => setUnlocked(null));
  }, [gameId]);

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {achievements.map((achievement) => {
          const done = unlocked?.has(achievement.key) ?? false;
          return (
            <li
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${done ? "border-[var(--accent)]/60 bg-[var(--accent)]/10" : "border-white/[0.08] bg-white/[0.02]"}`}
              key={achievement.key}
              style={{ "--accent": accent } as CSSProperties}
            >
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-lg text-lg font-black ${done ? "bg-[var(--accent)] text-white" : "bg-white/[0.06] text-[#69758f]"}`}
              >
                {achievement.symbol}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${done ? "text-white" : "text-[#aeb8cc]"}`}>
                  {achievement.name}
                  {done ? <span className="ml-2 text-xs font-medium text-[#9ee6b8]">已解锁</span> : null}
                </span>
                <span className="block text-xs text-[#8792a8]">{achievement.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {unlocked === null ? (
        <p className="mt-4 text-sm text-[#7f8aa3]">
          <Link className="text-[#8fa4ff] hover:text-white" href={loginHref}>
            登录后记录成就
          </Link>
        </p>
      ) : null}
    </div>
  );
}
