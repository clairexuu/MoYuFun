import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { getUserAchievements } from "@/lib/achievements";
import { getCurrentUser } from "@/lib/auth";
import { deleteAccount, logOut } from "@/lib/auth-actions";
import { getGames } from "@/lib/games";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "我的账号", robots: { index: false } };

export default async function MePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/me");
  }

  const [games, unlocks] = await Promise.all([getGames(), getUserAchievements(user.id)]);
  const groups = games
    .map((game) => {
      const mine = unlocks.filter((unlock) => unlock.game_id === game.id);
      const keys = new Set(mine.map((unlock) => unlock.key));
      const active = game.achievements.filter((achievement) => keys.has(achievement.key));
      const retired = mine.filter(
        (unlock) => !game.achievements.some((achievement) => achievement.key === unlock.key),
      );
      return { game, keys, active, retired };
    })
    .filter(({ game, keys }) => game.achievements.length > 0 || keys.size > 0);

  return (
    <AuthShell title="我的账号" wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#98a2b8]">已登录：{user.email}</p>
        <form action={logOut}>
          <button
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#c5cede] hover:bg-white/[0.06]"
            type="submit"
          >
            退出登录
          </button>
        </form>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-white">成就</h2>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-[#7f8aa3]">还没有带成就的游戏。</p>
      ) : (
        groups.map(({ game, keys, active, retired }) => (
          <section className="mt-4 rounded-xl border border-white/[0.08] p-4" key={game.id}>
            <div className="flex items-center justify-between gap-3">
              <Link className="font-semibold text-white hover:text-[#8fa4ff]" href={`/games/${game.slug}`}>
                {game.name}
              </Link>
              <span className="text-sm text-[#98a2b8]">
                {active.length} / {game.achievements.length}
              </span>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {game.achievements.map((achievement) => {
                const done = keys.has(achievement.key);
                return (
                  <li
                    className={`flex items-center gap-2 text-sm ${done ? "text-white" : "text-[#69758f]"}`}
                    key={achievement.key}
                  >
                    <span aria-hidden="true">{done ? "✓" : "○"}</span>
                    {achievement.symbol} {achievement.name}
                    <span className="text-xs text-[#7f8aa3]">{achievement.description}</span>
                  </li>
                );
              })}
              {retired.map((unlock) => (
                <li className="flex items-center gap-2 text-sm text-[#98a2b8]" key={unlock.key}>
                  <span aria-hidden="true">✓</span>
                  {unlock.key}
                  <span className="text-xs text-[#7f8aa3]">（已下线）</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <h2 className="mt-10 text-lg font-semibold text-[#ff9ba8]">删除账号</h2>
      <p className="mt-2 text-sm text-[#98a2b8]">
        删除后邮箱、密码和全部成就记录会立即移除，且无法恢复。请输入当前密码确认。
      </p>
      <div className="mt-4 max-w-md">
        <AuthForm action={deleteAccount} password="current-password" submitLabel="删除账号" />
      </div>
    </AuthShell>
  );
}
