import { GameCard } from "@/components/game-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getGames } from "@/lib/games";

export default function Home() {
  const games = getGames();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <section className="max-w-2xl">
          <p className="text-xs font-bold tracking-[0.24em] text-[#7f95ff] uppercase">
            HTML5 Games
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
            打开即玩，随时来一局
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#98a2b8] sm:text-lg">
            无需下载安装。挑一个小游戏，在浏览器里马上开始。
          </p>
        </section>

        <section aria-labelledby="all-games-heading" className="mt-12 sm:mt-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#7f8aa3]">游戏目录</p>
              <h2
                className="mt-1 text-2xl font-semibold tracking-tight text-white"
                id="all-games-heading"
              >
                全部游戏
              </h2>
            </div>
            <span className="text-sm text-[#69758f]">{games.length} 款</span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <GameCard game={game} key={game.slug} />
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
