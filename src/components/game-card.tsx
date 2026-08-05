import Link from "next/link";

import type { Game } from "@/lib/games";

import { GameCover } from "./game-cover";

type GameCardProps = {
  game: Game;
};

export function GameCard({ game }: GameCardProps) {
  return (
    <Link
      className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111722] shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-1 hover:border-[#6f8cff]/60 hover:shadow-[0_24px_80px_rgba(50,67,145,0.25)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8fa4ff]"
      href={`/games/${game.slug}`}
    >
      <GameCover compact cover={game.cover} />
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {game.tags.map((tag) => (
            <span
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-[#aeb8cc]"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[#f4f7ff]">
            {game.name}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#98a2b8]">
            {game.shortDescription}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#9aabff] transition group-hover:text-white">
          查看游戏
          <span aria-hidden="true" className="transition group-hover:translate-x-1">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
