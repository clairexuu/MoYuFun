import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { GAME_CATALOG_CACHE_TAG } from "@/lib/games";

function secretsMatch(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);

  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

export async function POST(request: Request) {
  const expected = process.env.MOYUFUN_REVALIDATE_SECRET?.trim();

  if (!expected) {
    return Response.json(
      { error: "Revalidation is not configured" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");

  if (
    !authorization?.startsWith("Bearer ") ||
    !secretsMatch(authorization.slice(7), expected)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag(GAME_CATALOG_CACHE_TAG, { expire: 0 });

  return Response.json({ revalidated: true });
}
