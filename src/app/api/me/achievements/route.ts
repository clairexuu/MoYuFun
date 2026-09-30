import { getUserAchievements, getUserStats } from "@/lib/achievements";
import { getCurrentUser } from "@/lib/auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const gameId = new URL(request.url).searchParams.get("game_id") ?? undefined;

  if (gameId !== undefined && !UUID_PATTERN.test(gameId)) {
    return Response.json({ error: "Invalid game_id" }, { status: 400, headers });
  }

  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const [unlocks, stats] = await Promise.all([
    getUserAchievements(user.id, gameId),
    gameId ? getUserStats(user.id, gameId) : undefined,
  ]);
  const unlocked = unlocks.map(({ key, unlocked_at }) => ({ key, unlocked_at }));

  return Response.json(stats ? { unlocked, stats } : { unlocked }, { headers });
}
