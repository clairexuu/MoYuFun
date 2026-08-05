import type { CSSProperties } from "react";

import type { GameCover as GameCoverData } from "@/lib/games";

type GameCoverProps = {
  cover: GameCoverData;
  compact?: boolean;
};

export function GameCover({ cover, compact = false }: GameCoverProps) {
  const style = {
    "--cover-accent": cover.accent,
    "--cover-accent-secondary": cover.accentSecondary,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={`game-cover ${compact ? "game-cover--compact" : ""}`}
      style={style}
    >
      <span className="game-cover__orb game-cover__orb--one" />
      <span className="game-cover__orb game-cover__orb--two" />
      <span className="game-cover__slash game-cover__slash--one" />
      <span className="game-cover__slash game-cover__slash--two" />
      <span className="game-cover__eyebrow">{cover.eyebrow}</span>
      <span className="game-cover__symbol">{cover.symbol}</span>
      <span className="game-cover__caption">SELECT · STRIKE · SURVIVE</span>
    </div>
  );
}
