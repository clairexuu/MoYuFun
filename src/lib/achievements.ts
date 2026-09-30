import "server-only";

import type { AchievementUnlock, UnlockResult } from "@/lib/achievement-request";
import { getDatabase } from "@/lib/database";
import { consumeRateLimit } from "@/lib/events";

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

export async function deleteUserAccount(userId: string): Promise<void> {
  await getDatabase()`select public.delete_user_account(${userId}::uuid)`;
}
