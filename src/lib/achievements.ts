import "server-only";

import type { AchievementUnlock, UnlockResult } from "@/lib/achievement-request";
import { getDatabase } from "@/lib/database";
import { consumeRateLimit } from "@/lib/events";
import type { RecordResult, RoundReport } from "@/lib/stats-request";

export async function unlockAchievement(
  userId: string,
  unlock: AchievementUnlock,
): Promise<UnlockResult> {
  if (!(await consumeRateLimit(`achievement-rate-limit:${userId}`))) {
    return "rate-limited";
  }

  const sql = getDatabase();
  const [{ status }] = await sql<{ status: UnlockResult }[]>`
    select public.unlock_achievement(
      ${userId}::uuid,
      ${unlock.game_id}::uuid,
      ${unlock.game_version_id}::uuid,
      ${unlock.key}::text
    ) as status
  `;

  return status;
}

export type UserUnlock = { game_id: string; key: string; unlocked_at: string };

export async function getUserAchievements(
  userId: string,
  gameId?: string,
): Promise<UserUnlock[]> {
  const sql = getDatabase();
  const rows = await sql<{ game_id: string; key: string; unlocked_at: Date }[]>`
    select game_id, key, unlocked_at
    from public.get_user_achievements(${userId}::uuid, ${gameId ?? null}::uuid)
  `;

  return rows.map((row) => ({
    game_id: row.game_id,
    key: row.key,
    unlocked_at: row.unlocked_at.toISOString(),
  }));
}

export async function recordRoundStats(
  userId: string,
  report: RoundReport,
): Promise<RecordResult> {
  if (!(await consumeRateLimit(`stats-rate-limit:${userId}`))) {
    return "rate-limited";
  }

  const sql = getDatabase();
  try {
    await sql`
      select public.record_round_stats(
        ${userId}::uuid,
        ${report.game_id}::uuid,
        ${report.game_version_id}::uuid,
        ${sql.json(report.stats)}::jsonb
      )
    `;
    return "ok";
  } catch (error) {
    // check_violation: undeclared key, value over the cap, or wrong version (D2).
    if ((error as { code?: string }).code === "23514") return "invalid";
    throw error;
  }
}

export async function getUserStats(
  userId: string,
  gameId: string,
): Promise<Record<string, number>> {
  const sql = getDatabase();
  const rows = await sql<{ stat_key: string; value: string | number }[]>`
    select stat_key, value
    from public.get_user_stats(${userId}::uuid, ${gameId}::uuid)
  `;

  return Object.fromEntries(rows.map((row) => [row.stat_key, Number(row.value)]));
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await getDatabase()`select public.delete_user_account(${userId}::uuid)`;
}
