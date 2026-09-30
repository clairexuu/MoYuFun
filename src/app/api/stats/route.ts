import { recordRoundStats } from "@/lib/achievements";
import { getCurrentUser, siteUrl } from "@/lib/auth";
import { handleStatsRequest } from "@/lib/stats-request";

export async function POST(request: Request) {
  return handleStatsRequest(request, {
    siteOrigin: siteUrl(),
    getUserId: async () => (await getCurrentUser())?.id,
    record: recordRoundStats,
  });
}
