import "server-only";

import { unstable_cache } from "next/cache";

import { getDatabase } from "@/lib/database";

export const GAME_CATALOG_CACHE_TAG = "game-catalog";

export type GameCover = {
  symbol: string;
  eyebrow: string;
  accent: string;
  accentSecondary: string;
};

export type GameControl = {
  input: string;
  action: string;
};

export type Game = {
  id: string;
  versionId: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  tags: readonly string[];
  controls: readonly GameControl[];
  cover: GameCover;
  entryPath: string;
  sortOrder: number;
};

type GameRow = {
  id: unknown;
  version_id: unknown;
  slug: unknown;
  name: unknown;
  short_description: unknown;
  description: unknown;
  tags: unknown;
  controls: unknown;
  cover: unknown;
  entry_path: unknown;
  sort_order: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid game catalog field: ${field}`);
  }

  return value;
}

function mapGame(row: GameRow): Game {
  if (
    !Array.isArray(row.tags) ||
    !row.tags.every((tag) => typeof tag === "string")
  ) {
    throw new Error("Invalid game catalog field: tags");
  }

  if (!Array.isArray(row.controls)) {
    throw new Error("Invalid game catalog field: controls");
  }

  const controls = row.controls.map((control) => {
    if (!isRecord(control)) {
      throw new Error("Invalid game catalog field: controls");
    }

    return {
      input: readString(control.input, "controls.input"),
      action: readString(control.action, "controls.action"),
    };
  });

  if (!isRecord(row.cover)) {
    throw new Error("Invalid game catalog field: cover");
  }

  if (!Number.isInteger(row.sort_order)) {
    throw new Error("Invalid game catalog field: sort_order");
  }

  return {
    id: readString(row.id, "id"),
    versionId: readString(row.version_id, "version_id"),
    slug: readString(row.slug, "slug"),
    name: readString(row.name, "name"),
    shortDescription: readString(row.short_description, "short_description"),
    description: readString(row.description, "description"),
    tags: row.tags,
    controls,
    cover: {
      symbol: readString(row.cover.symbol, "cover.symbol"),
      eyebrow: readString(row.cover.eyebrow, "cover.eyebrow"),
      accent: readString(row.cover.accent, "cover.accent"),
      accentSecondary: readString(
        row.cover.accentSecondary,
        "cover.accentSecondary",
      ),
    },
    entryPath: readString(row.entry_path, "entry_path"),
    sortOrder: row.sort_order as number,
  };
}

async function readGames(): Promise<Game[]> {
  const sql = getDatabase();
  const rows = await sql<GameRow[]>`
    select
      g.id,
      v.id as version_id,
      g.slug,
      g.name,
      g.short_description,
      g.description,
      g.tags,
      g.controls,
      g.cover,
      g.sort_order,
      v.entry_path
    from public.games g
    join public.game_versions v
      on v.game_id = g.id
      and v.id = g.current_version_id
    where g.is_listed = true
    order by g.sort_order asc, g.slug asc
  `;

  return rows.map(mapGame);
}

const getCachedGames = unstable_cache(readGames, [GAME_CATALOG_CACHE_TAG], {
  revalidate: 300,
  tags: [GAME_CATALOG_CACHE_TAG],
});

export async function getGames(): Promise<Game[]> {
  return getCachedGames();
}

export async function getGameBySlug(slug: string): Promise<Game | undefined> {
  return (await getGames()).find((game) => game.slug === slug);
}

export function getGameUrl(game: Game): string {
  const configuredOrigin =
    process.env.GAMES_ORIGIN?.trim() || "http://localhost:4000";
  const origin = new URL(configuredOrigin);

  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("GAMES_ORIGIN must use http or https");
  }

  return new URL(game.entryPath, `${origin.origin}/`).toString();
}
