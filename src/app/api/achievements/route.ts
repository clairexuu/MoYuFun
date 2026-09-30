import { handleAchievementRequest } from "@/lib/achievement-request";
import { unlockAchievement } from "@/lib/achievements";
import { getCurrentUser, siteUrl } from "@/lib/auth";

export async function POST(request: Request) {
  return handleAchievementRequest(request, {
    siteOrigin: siteUrl(),
    getUserId: async () => (await getCurrentUser())?.id,
    unlock: unlockAchievement,
  });
}
