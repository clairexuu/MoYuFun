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
