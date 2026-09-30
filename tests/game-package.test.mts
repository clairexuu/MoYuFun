import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkLimits,
  checkPackage,
  findAchievementKeys,
  MAX_BYTES,
  MAX_FILES,
} from "../scripts/game-package.mts";

const MANIFEST = {
  slug: "demo",
  name: "Demo",
  shortDescription: "short",
  description: "long",
  tags: ["动作"],
  controls: [{ input: "WASD", action: "移动" }],
  cover: { symbol: "刃", eyebrow: "E", accent: "#000", accentSecondary: "#fff" },
  sortOrder: 0,
  achievements: [
    { key: "first_blood", name: "初见血", description: "取得一次击杀。", symbol: "血" },
  ],
};

const INDEX = `<script>
const ORIGIN = 'https://www.moyufuns.com';
emitMoYuFunAchievement('first_blood');
</script>`;

type Options = {
  manifest?: unknown;
  index?: string | null;
  test?: boolean;
  extraFiles?: Record<string, string>;
};

async function makePackage(options: Options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "game-package-"));
  const versionDir = path.join(root, "demo", "v1");
  await mkdir(versionDir, { recursive: true });
  await writeFile(
    path.join(root, "demo", "game.json"),
    JSON.stringify(options.manifest ?? MANIFEST),
  );
  if (options.index !== null) {
    await writeFile(path.join(versionDir, "index.html"), options.index ?? INDEX);
  }
  if (options.test !== false) {
    await writeFile(path.join(versionDir, "test_headless.js"), "");
  }
  for (const [name, body] of Object.entries(options.extraFiles ?? {})) {
    await mkdir(path.dirname(path.join(versionDir, name)), { recursive: true });
    await writeFile(path.join(versionDir, name), body);
  }
  return { root, versionDir, [Symbol.asyncDispose]: () => rm(root, { recursive: true }) };
}

async function rejects(options: Options, message: RegExp) {
  await using pkg = await makePackage(options);
  await assert.rejects(checkPackage(pkg.root, "demo", "v1"), message);
}

test("accepts a complete package and lists runtime files", async () => {
  await using pkg = await makePackage({
    extraFiles: { "assets/a.png": "x", ".DS_Store": "junk", "README.md": "r" },
  });
  const result = await checkPackage(pkg.root, "demo", "v1");
  assert.deepEqual(
    result.files.map((f) => f.path),
    ["assets/a.png", "index.html"],
  );
  assert.equal(result.files[1].contentType, "text/html; charset=utf-8");
  assert.equal(result.totalBytes, 1 + INDEX.length);
});

test("rejects manifest rule violations", async () => {
  await rejects({ manifest: { ...MANIFEST, slug: "Bad_Slug" } }, /slug must match/);
  await rejects({ manifest: { ...MANIFEST, slug: "other" } }, /≠ folder/);
  await rejects({ manifest: { ...MANIFEST, extra: 1 } }, /unknown key "extra"/);
  await rejects({ manifest: { ...MANIFEST, sortOrder: 1.5 } }, /sortOrder/);
  await rejects({ manifest: { ...MANIFEST, cover: { symbol: "x" } } }, /cover/);
  await rejects(
    { manifest: { ...MANIFEST, controls: [{ input: "a" }] } },
    /controls/,
  );
});

test("rejects bad and duplicate achievements", async () => {
  const a = MANIFEST.achievements[0];
  await rejects(
    { manifest: { ...MANIFEST, achievements: [{ ...a, key: "Bad-Key" }] } },
    /key must match/,
  );
  await rejects(
    { manifest: { ...MANIFEST, achievements: [{ ...a, name: "x".repeat(21) }] } },
    /name must be 1–20/,
  );
  await rejects(
    { manifest: { ...MANIFEST, achievements: [{ ...a, description: "" }] } },
    /description must be 1–60/,
  );
  await rejects(
    { manifest: { ...MANIFEST, achievements: [{ ...a, symbol: "abc" }] } },
    /symbol must be 1–2/,
  );
  await rejects(
    { manifest: { ...MANIFEST, achievements: [a, a] } },
    /is duplicated/,
  );
});

test("accepts declared stats and rejects bad ones", async () => {
  const stat = { key: "kills", name: "击杀", maxPerRound: 10 };
  await using pkg = await makePackage({ manifest: { ...MANIFEST, stats: [stat] } });
  const result = await checkPackage(pkg.root, "demo", "v1");
  assert.deepEqual(result.manifest.stats, [stat]);

  await using bare = await makePackage();
  assert.deepEqual((await checkPackage(bare.root, "demo", "v1")).manifest.stats, []);

  await rejects({ manifest: { ...MANIFEST, stats: {} } }, /stats must be an array/);
  await rejects(
    { manifest: { ...MANIFEST, stats: [{ ...stat, key: "Bad-Key" }] } },
    /stats\[0\]\.key must match/,
  );
  await rejects(
    { manifest: { ...MANIFEST, stats: [{ ...stat, name: "" }] } },
    /stats\[0\]\.name must be 1–20/,
  );
  await rejects(
    { manifest: { ...MANIFEST, stats: [{ ...stat, maxPerRound: 0 }] } },
    /maxPerRound must be an integer from 1 to 1000000/,
  );
  await rejects(
    { manifest: { ...MANIFEST, stats: [{ ...stat, maxPerRound: 1.5 }] } },
    /maxPerRound/,
  );
  await rejects(
    { manifest: { ...MANIFEST, stats: [{ ...stat, extra: 1 }] } },
    /stats\[0\] has unknown key "extra"/,
  );
  await rejects({ manifest: { ...MANIFEST, stats: [stat, stat] } }, /is duplicated/);
});

test("rejects unknown extensions and symlinks", async () => {
  await rejects({ extraFiles: { "data.bin": "x" } }, /data\.bin: unknown extension/);

  await using pkg = await makePackage();
  await symlink(
    path.join(pkg.versionDir, "index.html"),
    path.join(pkg.versionDir, "link.html"),
  );
  await assert.rejects(checkPackage(pkg.root, "demo", "v1"), /symlinks/);
});

test("rejects missing entry, missing test, and size limits", async () => {
  await rejects({ index: null }, /index\.html is missing/);
  await rejects({ test: false }, /test_headless\.js is missing/);

  const entry = { path: "index.html", bytes: 1, contentType: "text/html" };
  assert.throws(
    () => checkLimits([{ ...entry, bytes: MAX_BYTES + 1 }]),
    /exceeds the limit of 31457280/,
  );
  assert.throws(
    () =>
      checkLimits([
        entry,
        ...Array.from({ length: MAX_FILES }, (_, i) => ({
          ...entry,
          path: `${i}.png`,
        })),
      ]),
    /exceeds the limit of 500/,
  );
});

test("rejects SDK misuse", async () => {
  await rejects(
    { index: "<script>emitMoYuFunAchievement('first_blood')</script>" },
    /never mention https:\/\/www\.moyufuns\.com/,
  );
  await rejects(
    { index: `${INDEX}<script>emitMoYuFunAchievement("nope")</script>` },
    /missing from game\.json: nope/,
  );
  await rejects(
    {
      manifest: {
        ...MANIFEST,
        achievements: [
          ...MANIFEST.achievements,
          { key: "ghost", name: "幽", description: "从未触发。", symbol: "幽" },
        ],
      },
    },
    /never mentioned in runtime files: ghost/,
  );
  assert.deepEqual(
    findAchievementKeys(`emitMoYuFunAchievement( "a" ); emitMoYuFunAchievement('b_c')`),
    ["a", "b_c"],
  );
});
