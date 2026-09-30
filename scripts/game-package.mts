// Pure package checks for games/<slug>/<version>. See docs/design/game-release.md.
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const MAX_FILES = 500;
export const MAX_BYTES = 31_457_280;
export const PARENT_ORIGIN = "https://www.moyufuns.com";
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const VERSION_PATTERN = /^v[0-9]+(?:[.-][a-z0-9]+)*$/;
const ACHIEVEMENT_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SKIPPED_FILES = new Set(["test_headless.js", "README.md"]);

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  woff2: "font/woff2",
  wasm: "application/wasm",
};

export type Achievement = {
  key: string;
  name: string;
  description: string;
  symbol: string;
};

export type Manifest = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  tags: string[];
  controls: { input: string; action: string }[];
  cover: {
    symbol: string;
    eyebrow: string;
    accent: string;
    accentSecondary: string;
  };
  sortOrder: number;
  achievements: Achievement[];
};

export type RuntimeFile = { path: string; bytes: number; contentType: string };

const MANIFEST_KEYS = [
  "slug",
  "name",
  "shortDescription",
  "description",
  "tags",
  "controls",
  "cover",
  "sortOrder",
  "achievements",
];
const COVER_KEYS = ["symbol", "eyebrow", "accent", "accentSecondary"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, min = 1, max = Infinity): value is string {
  return (
    typeof value === "string" && value.length >= min && value.length <= max
  );
}

export function validateManifest(json: unknown): Manifest {
  const errors: string[] = [];

  if (!isRecord(json)) {
    throw new Error("game.json: must be an object");
  }

  for (const key of Object.keys(json)) {
    if (!MANIFEST_KEYS.includes(key)) errors.push(`unknown key "${key}"`);
  }

  if (!isText(json.slug) || !SLUG_PATTERN.test(json.slug)) {
    errors.push("slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$");
  }
  for (const key of ["name", "shortDescription", "description"]) {
    if (!isText(json[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (!Array.isArray(json.tags) || !json.tags.every((t) => isText(t))) {
    errors.push("tags must be an array of non-empty strings");
  }
  if (
    !Array.isArray(json.controls) ||
    !json.controls.every(
      (c) => isRecord(c) && isText(c.input) && isText(c.action),
    )
  ) {
    errors.push("controls must be an array of {input, action}");
  }
  const cover = json.cover;
  if (!isRecord(cover) || !COVER_KEYS.every((k) => isText(cover[k]))) {
    errors.push(`cover must have non-empty ${COVER_KEYS.join(", ")}`);
  }
  if (!Number.isInteger(json.sortOrder)) {
    errors.push("sortOrder must be an integer");
  }

  if (!Array.isArray(json.achievements)) {
    errors.push("achievements must be an array");
  } else {
    const seen = new Set<string>();
    json.achievements.forEach((a, i) => {
      const at = `achievements[${i}]`;
      if (!isRecord(a)) return errors.push(`${at} must be an object`);
      if (!isText(a.key, 1, 40) || !ACHIEVEMENT_KEY_PATTERN.test(a.key)) {
        errors.push(`${at}.key must match ^[a-z0-9]+(?:_[a-z0-9]+)*$ (≤ 40)`);
      } else if (seen.has(a.key)) {
        errors.push(`${at}.key "${a.key}" is duplicated`);
      } else {
        seen.add(a.key);
      }
      if (!isText(a.name, 1, 20)) errors.push(`${at}.name must be 1–20 chars`);
      if (!isText(a.description, 1, 60)) {
        errors.push(`${at}.description must be 1–60 chars`);
      }
      if (!isText(a.symbol, 1, 2)) errors.push(`${at}.symbol must be 1–2 chars`);
      for (const key of Object.keys(a)) {
        if (!["key", "name", "description", "symbol"].includes(key)) {
          errors.push(`${at} has unknown key "${key}"`);
        }
      }
    });
  }

  if (errors.length) throw new Error(`game.json:\n- ${errors.join("\n- ")}`);
  return json as unknown as Manifest;
}

export async function readManifest(gameDir: string): Promise<Manifest> {
  const manifest = validateManifest(
    JSON.parse(await readFile(path.join(gameDir, "game.json"), "utf8")),
  );
  const folder = path.basename(gameDir);
  if (manifest.slug !== folder) {
    throw new Error(`game.json: slug "${manifest.slug}" ≠ folder "${folder}"`);
  }
  return manifest;
}

export async function listRuntimeFiles(
  versionDir: string,
): Promise<RuntimeFile[]> {
  const entries = await readdir(versionDir, {
    withFileTypes: true,
    recursive: true,
  });
  const files: RuntimeFile[] = [];
  const errors: string[] = [];

  for (const entry of entries) {
    const relative = path
      .relative(versionDir, path.join(entry.parentPath, entry.name))
      .split(path.sep)
      .join("/");
    if (relative.split("/").some((part) => part.startsWith("."))) continue;
    if (entry.isSymbolicLink()) {
      errors.push(`${relative}: symlinks are not allowed`);
      continue;
    }
    if (!entry.isFile() || SKIPPED_FILES.has(relative)) continue;

    const contentType = CONTENT_TYPES[path.extname(relative).slice(1)];
    if (!contentType) {
      errors.push(`${relative}: unknown extension`);
      continue;
    }
    const { size } = await stat(path.join(versionDir, relative));
    files.push({ path: relative, bytes: size, contentType });
  }

  if (errors.length) throw new Error(`runtime files:\n- ${errors.join("\n- ")}`);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function checkLimits(files: RuntimeFile[]): number {
  if (!files.some((f) => f.path === "index.html")) {
    throw new Error("index.html is missing");
  }
  if (files.length > MAX_FILES) {
    throw new Error(`${files.length} files exceeds the limit of ${MAX_FILES}`);
  }
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  if (total > MAX_BYTES) {
    throw new Error(`${total} bytes exceeds the limit of ${MAX_BYTES}`);
  }
  return total;
}

export function findAchievementKeys(text: string): string[] {
  return [
    ...text.matchAll(/emitMoYuFunAchievement\(\s*(['"])([^'"]*)\1\s*\)/g),
  ].map((m) => m[2]);
}

export function hasParentOrigin(texts: string[]): boolean {
  return texts.some((text) => text.includes(PARENT_ORIGIN));
}

export type Package = {
  manifest: Manifest;
  files: RuntimeFile[];
  totalBytes: number;
  versionDir: string;
};

/** Every package-contract rule except running the headless test. */
export async function checkPackage(
  gamesRoot: string,
  slug: string,
  version: string,
): Promise<Package> {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`invalid slug "${slug}"`);
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`invalid version "${version}"`);
  }
  const gameDir = path.join(gamesRoot, slug);
  const versionDir = path.join(gameDir, version);
  const manifest = await readManifest(gameDir);
  const files = await listRuntimeFiles(versionDir);
  const totalBytes = checkLimits(files);

  await access(path.join(versionDir, "test_headless.js")).catch(() => {
    throw new Error("test_headless.js is missing");
  });

  const texts = await Promise.all(
    files
      .filter(
        (f) =>
          f.contentType.startsWith("text/") ||
          f.contentType.startsWith("application/json"),
      )
      .map((f) => readFile(path.join(versionDir, f.path), "utf8")),
  );
  if (!hasParentOrigin(texts)) {
    throw new Error(`runtime files never mention ${PARENT_ORIGIN}`);
  }
  const known = new Set(manifest.achievements.map((a) => a.key));
  const unknown = texts
    .flatMap(findAchievementKeys)
    .filter((key) => !known.has(key));
  if (unknown.length) {
    throw new Error(
      `emitted achievement keys missing from game.json: ${[...new Set(unknown)].join(", ")}`,
    );
  }
  // ponytail: substring match, not a parse; catches typos and unimplemented keys, not dynamic keys.
  const unused = [...known].filter(
    (key) => !texts.some((t) => t.includes(`'${key}'`) || t.includes(`"${key}"`)),
  );
  if (unused.length) {
    throw new Error(
      `game.json achievements never mentioned in runtime files: ${unused.join(", ")}`,
    );
  }

  return { manifest, files, totalBytes, versionDir };
}
