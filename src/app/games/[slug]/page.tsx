import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GameCover } from "@/components/game-cover";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getGameBySlug, getGames } from "@/lib/games";

export const dynamicParams = false;

export function generateStaticParams() {
  return getGames().map((game) => ({ slug: game.slug }));
}

export async function generateMetadata(
  props: PageProps<"/games/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const game = getGameBySlug(slug);

  if (!game) {
    return { title: "游戏不存在" };
  }

  return {
    title: game.name,
    description: game.shortDescription,
  };
}

export default async function GameDetailPage(
  props: PageProps<"/games/[slug]">,
) {
  const { slug } = await props.params;
  const game = getGameBySlug(slug);

  if (!game) {
    notFound();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
        <Link
          className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-[#8f9ab0] transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8fa4ff]"
          href="/"
        >
          <span aria-hidden="true">←</span>
          全部游戏
        </Link>

        <section className="mt-8 grid items-center gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)] lg:gap-12">
          <GameCover cover={game.cover} />

          <div>
            <div className="flex flex-wrap gap-2">
              {game.tags.map((tag) => (
                <span
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[#aeb8cc]"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">
              {game.name}
            </h1>
            <p className="mt-5 text-base leading-7 text-[#a5afc2]">
              {game.shortDescription}
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-[#7f8aa3]">
              <span aria-hidden="true" className="text-[#8fa4ff]">
                ◈
              </span>
              键鼠操作，建议使用电脑游玩
            </p>
            <Link
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r from-[#637cff] to-[#8c65f5] px-7 py-3 text-sm font-bold text-white shadow-[0_14px_35px_rgba(82,101,214,0.3)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a9b6ff]"
              href={`/play/${game.slug}`}
            >
              开始游戏
              <span aria-hidden="true" className="ml-2">
                →
              </span>
            </Link>
          </div>
        </section>

        <section className="mt-12 grid gap-6 border-t border-white/[0.08] pt-10 md:grid-cols-[1fr_1.1fr] md:gap-10 sm:mt-16 sm:pt-12">
          <article>
            <p className="text-xs font-bold tracking-[0.2em] text-[#7f95ff] uppercase">
              About
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">玩法介绍</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[#98a2b8] sm:text-base">
              {game.description}
            </p>
          </article>

          <article className="rounded-2xl border border-white/[0.08] bg-[#111722] p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">操作说明</h2>
            <dl className="mt-5 divide-y divide-white/[0.07]">
              {game.controls.map((control) => (
                <div
                  className="grid grid-cols-[minmax(120px,0.9fr)_1fr] gap-4 py-3 first:pt-0 last:pb-0"
                  key={`${control.input}-${control.action}`}
                >
                  <dt className="text-sm font-semibold text-[#cbd3e3]">
                    {control.input}
                  </dt>
                  <dd className="text-sm text-[#8792a8]">{control.action}</dd>
                </div>
              ))}
            </dl>
          </article>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
