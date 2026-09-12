import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GamePlayer } from "@/components/game-player";
import { getGameBySlug, getGames, getGameUrl } from "@/lib/games";

export const dynamic = "force-static";
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getGames()).map((game) => ({ slug: game.slug }));
}

export async function generateMetadata(
  props: PageProps<"/play/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const game = await getGameBySlug(slug);

  return {
    title: game ? `正在游玩 ${game.name}` : "游戏不存在",
    robots: {
      follow: false,
      index: false,
    },
  };
}

export default async function PlayGamePage(props: PageProps<"/play/[slug]">) {
  const { slug } = await props.params;
  const game = await getGameBySlug(slug);

  if (!game) {
    notFound();
  }

  return (
    <main className="flex min-h-dvh items-start justify-center px-0 py-0 sm:items-center sm:px-5 sm:py-6">
      <GamePlayer
        detailHref={`/games/${game.slug}`}
        gameId={game.id}
        gameVersionId={game.versionId}
        key={`${game.id}:${game.versionId}`}
        path={`/play/${game.slug}`}
        src={getGameUrl(game)}
        title={game.name}
      />
    </main>
  );
}
