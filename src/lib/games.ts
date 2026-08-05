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

const gameCatalog = [
  {
    slug: "slash",
    name: "乱刃 · 斩击大乱斗",
    shortDescription: "选两种斩击，与五名 AI 剑客展开快节奏混战。",
    description:
      "在六种斩击中自由搭配两种招式，利用走位、突进和击退效果击败对手。率先取得十次击杀即可赢下这场乱斗。",
    tags: ["动作", "单人", "键鼠"],
    controls: [
      { input: "WASD / 方向键", action: "移动" },
      { input: "鼠标", action: "瞄准" },
      { input: "鼠标左键 / J", action: "使用左槽斩击" },
      { input: "鼠标右键 / K", action: "使用右槽斩击" },
      { input: "M", action: "静音或恢复声音" },
      { input: "R / B", action: "再战 / 返回配装" },
    ],
    cover: {
      symbol: "斩",
      eyebrow: "TOP-DOWN ARENA",
      accent: "#6f8cff",
      accentSecondary: "#9b6dff",
    },
    entryPath: "/slash/",
    sortOrder: 10,
  },
] as const satisfies readonly Game[];

export function getGames(): Game[] {
  return [...gameCatalog].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getGameBySlug(slug: string): Game | undefined {
  return gameCatalog.find((game) => game.slug === slug);
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
