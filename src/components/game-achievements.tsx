"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";

import type { GameAchievement, GameStat } from "@/lib/games";

type GameAchievementsProps = {
  accent: string;
  achievements: readonly GameAchievement[];
  gameId: string;
  loginHref: string;
  stats: readonly GameStat[];
};

type Mine = { unlocked: Set<string>; stats: Record<string, number> };

export function GameAchievements({
  accent,
  achievements,
  gameId,
  loginHref,
  stats,
}: GameAchievementsProps) {
  // undefined = loading, null = logged out
  const [mine, setMine] = useState<Mine | null>();

  useEffect(() => {
    fetch(`/api/me/achievements?game_id=${gameId}`, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { unlocked: { key: string }[]; stats: Record<string, number> } | null) =>
        setMine(
          body
            ? { unlocked: new Set(body.unlocked.map((entry) => entry.key)), stats: body.stats }
            : null,
        ),
      )
      .catch(() => setMine(null));
  }, [gameId]);

  return (
    <div style={{ "--accent": accent } as CSSProperties}>
      {mine && stats.length > 0 ? (
        <dl className="mb-6 grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div
              className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-4 text-center"
              key={stat.key}
            >
              <dd className="text-3xl font-black text-[var(--accent)] tabular-nums">
                {mine.stats[stat.key] ?? 0}
              </dd>
              <dt className="mt-1 text-xs font-semibold text-[#aeb8cc]">{stat.name}</dt>
            </div>
          ))}
        </dl>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {achievements.map((achievement) => {
          const done = mine?.unlocked.has(achievement.key) ?? false;
          return (
            <li
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${done ? "border-[var(--accent)]/60 bg-[var(--accent)]/10" : "border-white/[0.08] bg-white/[0.02]"}`}
              key={achievement.key}
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
      {mine === null ? (
        <p className="mt-4 text-sm text-[#7f8aa3]">
          <Link className="text-[#8fa4ff] hover:text-white" href={loginHref}>
            登录后记录战绩与成就
          </Link>
        </p>
      ) : null}
    </div>
  );
}
