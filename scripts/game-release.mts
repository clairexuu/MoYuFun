// CLI: pnpm game <check|publish|switch> <slug> <version> | pnpm game unlist <slug>. See docs/design/game-release.md.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { AwsClient } from "aws4fetch";
import postgres from "postgres";

import { checkPackage, type Package } from "./game-package.mts";

const GAMES_ROOT = path.resolve(import.meta.dirname, "../games");

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    notes: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});
const [command, slug, version] = positionals;

const needsVersion = ["check", "publish", "switch"].includes(command);
if (!(needsVersion || command === "unlist") || !slug || (needsVersion && !version)) {
  console.error(
    "usage: pnpm game check|publish|switch <slug> <version> [--notes <text>] [--yes]\n" +
      "       pnpm game unlist <slug> [--yes]",
  );
  process.exit(2);
}

// ---------- check ----------

async function check(): Promise<Package> {
  const pkg = await checkPackage(GAMES_ROOT, slug, version);
  for (const file of pkg.files) {
    console.log(`  ${file.path}  ${file.bytes} B  ${file.contentType}`);
  }
  console.log(`${pkg.files.length} files, ${pkg.totalBytes} bytes`);

  const test = spawnSync(
    process.execPath,
    [path.join(pkg.versionDir, "test_headless.js")],
    { stdio: "inherit" },
  );
  if (test.status !== 0) throw new Error("test_headless.js failed");
  console.log(`check passed: ${slug} ${version}`);
  return pkg;
}

// ---------- environment ----------

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function readEnv() {
  const dbUrl = requireEnv("MOYUFUN_PUBLISH_DATABASE_URL");
  if (!URL.canParse(dbUrl) || !new URL(dbUrl).username.startsWith("moyufun_publisher.")) {
    throw new Error("MOYUFUN_PUBLISH_DATABASE_URL must use the moyufun_publisher role");
  }
  const gamesOrigin = new URL(requireEnv("GAMES_ORIGIN")).origin;
  const siteOrigin = new URL(requireEnv("SITE_URL")).origin;
  const isLocal = ["localhost", "127.0.0.1"].includes(new URL(gamesOrigin).hostname);
  return {
    dbUrl,
    dbHost: new URL(dbUrl).hostname,
    gamesOrigin,
    siteOrigin,
    isLocal,
    revalidateSecret: requireEnv("MOYUFUN_REVALIDATE_SECRET"),
    r2: isLocal
      ? undefined
      : {
          accountId: requireEnv("R2_ACCOUNT_ID"),
          bucket: requireEnv("R2_BUCKET"),
          accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
          secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
        },
  };
}
type Env = ReturnType<typeof readEnv>;

async function confirm(env: Env, summary: string): Promise<void> {
  console.log(`\ntarget: db ${env.dbHost} · games ${env.gamesOrigin} · site ${env.siteOrigin}`);
  console.log(`${command}: ${summary}`);
  if (flags.yes) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Continue? [y/N] ");
  rl.close();
  if (answer.trim() !== "y") throw new Error("aborted");
}

// ---------- shared steps ----------

const entryPath = `/games/${slug}/${version}/index.html`;
const objectKey = (file: string) =>
  `games/${slug}/${version}/${file.split("/").map(encodeURIComponent).join("/")}`;

async function upload(env: Env, pkg: Package): Promise<void> {
  const { accountId, bucket, accessKeyId, secretAccessKey } = env.r2!;
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  for (const file of pkg.files) {
    const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${objectKey(file.path)}`;
    const response = await client.fetch(url, {
      method: "PUT",
      body: await readFile(path.join(pkg.versionDir, file.path)),
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    if (!response.ok) {
      throw new Error(`upload: ${file.path} returned ${response.status} ${await response.text()}`);
    }
    console.log(`  uploaded ${file.path}`);
  }
}

async function verify(env: Env, pkg: Package): Promise<void> {
  for (const file of pkg.files) {
    const url = `${env.gamesOrigin}/${objectKey(file.path)}`;
    const isEntry = file.path === "index.html";
    const response = await fetch(url, {
      headers: isEntry ? { Origin: env.siteOrigin } : {},
    });
    if (response.status !== 200) {
      throw new Error(`verify: ${url} returned ${response.status}`);
    }
    const remote = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    const local = createHash("sha256")
      .update(await readFile(path.join(pkg.versionDir, file.path)))
      .digest("hex");
    if (remote !== local) throw new Error(`verify: ${url} hash mismatch`);
    if (isEntry) {
      const allow = response.headers.get("access-control-allow-origin");
      if (allow !== "*" && allow !== env.siteOrigin) {
        throw new Error(`verify: entry Access-Control-Allow-Origin is ${allow ?? "missing"}`);
      }
    }
  }
  console.log(`verified ${pkg.files.length} files at ${env.gamesOrigin}`);
}

async function revalidateAndSmoke(env: Env): Promise<void> {
  const revalidate = await fetch(`${env.siteOrigin}/api/revalidate/games`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.revalidateSecret}` },
  });
  if (revalidate.status !== 200) {
    throw new Error(`DB committed, but revalidate returned ${revalidate.status}; the catalog refreshes within 5 minutes`);
  }
  console.log("catalog cache revalidated");

  const playUrl = `${env.siteOrigin}/play/${slug}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(playUrl, { cache: "no-store" });
    if (response.status === 200 && (await response.text()).includes(entryPath)) {
      console.log(`smoke passed: ${playUrl} serves ${entryPath}`);
      return;
    }
    if (attempt < 5) await sleep(3000);
  }
  throw new Error(`DB committed, but ${playUrl} does not serve ${entryPath} yet`);
}

// ---------- publish ----------

async function publish(): Promise<void> {
  const pkg = await check();
  const env = readEnv();
  await confirm(env, `${slug} ${version}, ${pkg.files.length} files, ${pkg.totalBytes} bytes`);

  const sql = postgres(env.dbUrl, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    const [existing] = await sql`
      select 1 from public.game_versions v
      join public.games g on g.id = v.game_id
      where g.slug = ${slug} and v.version_key = ${version}`;
    if (existing) throw new Error(`${slug} ${version} is already published; use switch`);

    if (env.isLocal) console.log("localhost GAMES_ORIGIN: skipping upload");
    else await upload(env, pkg);
    await verify(env, pkg);

    const m = pkg.manifest;
    await sql.begin(async (tx) => {
      const [game] = await tx`
        insert into public.games
          (slug, name, short_description, description, tags, controls, cover, sort_order, is_listed)
        values
          (${m.slug}, ${m.name}, ${m.shortDescription}, ${m.description}, ${m.tags},
           ${tx.json(m.controls)}, ${tx.json(m.cover)}, ${m.sortOrder}, false)
        on conflict (slug) do update set
          name = excluded.name,
          short_description = excluded.short_description,
          description = excluded.description,
          tags = excluded.tags,
          controls = excluded.controls,
          cover = excluded.cover,
          sort_order = excluded.sort_order,
          updated_at = now()
        returning id`;
      const [release] = await tx`
        insert into public.game_versions (game_id, version_key, entry_path, file_size_bytes, release_notes)
        values (${game.id}, ${version}, ${entryPath}, ${pkg.totalBytes}, ${flags.notes ?? null})
        returning id`;
      for (const [index, a] of m.achievements.entries()) {
        await tx`
          insert into public.achievements (game_id, key, name, description, symbol, sort_order, is_active)
          values (${game.id}, ${a.key}, ${a.name}, ${a.description}, ${a.symbol}, ${index + 1}, true)
          on conflict (game_id, key) do update set
            name = excluded.name,
            description = excluded.description,
            symbol = excluded.symbol,
            sort_order = excluded.sort_order,
            is_active = true`;
      }
      const keys = m.achievements.map((a) => a.key);
      await tx`
        update public.achievements set is_active = false
        where game_id = ${game.id} and is_active and not (key = any(${keys}::text[]))`;
      for (const [index, s] of m.stats.entries()) {
        await tx`
          insert into public.game_stats (game_id, key, name, max_per_round, sort_order, is_active)
          values (${game.id}, ${s.key}, ${s.name}, ${s.maxPerRound}, ${index + 1}, true)
          on conflict (game_id, key) do update set
            name = excluded.name,
            max_per_round = excluded.max_per_round,
            sort_order = excluded.sort_order,
            is_active = true`;
      }
      const statKeys = m.stats.map((s) => s.key);
      await tx`
        update public.game_stats set is_active = false
        where game_id = ${game.id} and is_active and not (key = any(${statKeys}::text[]))`;
      await tx`
        update public.games
        set current_version_id = ${release.id}, is_listed = true, updated_at = now()
        where id = ${game.id}`;
    });
    console.log(`registered ${slug} ${version} and made it current`);
  } finally {
    await sql.end();
  }

  await revalidateAndSmoke(env);
}

// ---------- switch ----------

async function switchVersion(): Promise<void> {
  const env = readEnv();
  const sql = postgres(env.dbUrl, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    const [target] = await sql`
      select v.id, v.entry_path, (v.id = g.current_version_id) as is_current
      from public.game_versions v
      join public.games g on g.id = v.game_id
      where g.slug = ${slug} and v.version_key = ${version}`;
    if (!target) throw new Error(`${slug} ${version} is not published`);

    const entryUrl = `${env.gamesOrigin}${target.entry_path}`;
    const response = await fetch(entryUrl);
    if (response.status !== 200) {
      throw new Error(`${entryUrl} returned ${response.status}`);
    }

    await confirm(env, `${slug} → ${version}${target.is_current ? " (already current)" : ""}`);
    await sql`
      update public.games set current_version_id = ${target.id}, updated_at = now()
      where slug = ${slug}`;
    console.log(`switched ${slug} to ${version}`);
  } finally {
    await sql.end();
  }

  await revalidateAndSmoke(env);
}

// ---------- unlist ----------

// Hides a game from the catalog and its pages (office-camouflage D10). Nothing is deleted;
// a later publish lists it again.
async function unlist(): Promise<void> {
  const env = readEnv();
  const sql = postgres(env.dbUrl, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    const [game] = await sql`select is_listed from public.games where slug = ${slug}`;
    if (!game) throw new Error(`${slug} is not a registered game`);
    await confirm(env, `${slug}${game.is_listed ? "" : " (already unlisted)"}`);
    await sql`update public.games set is_listed = false, updated_at = now() where slug = ${slug}`;
    console.log(`unlisted ${slug}`);
  } finally {
    await sql.end();
  }

  const revalidate = await fetch(`${env.siteOrigin}/api/revalidate/games`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.revalidateSecret}` },
  });
  if (revalidate.status !== 200) {
    throw new Error(`DB committed, but revalidate returned ${revalidate.status}; the catalog refreshes within 5 minutes`);
  }
  console.log("catalog cache revalidated");

  // The static play page regenerates on the request after revalidation, so allow a few tries.
  const playUrl = `${env.siteOrigin}/play/${slug}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(playUrl, { cache: "no-store" });
    if (response.status === 404) {
      console.log(`smoke passed: ${playUrl} answers 404`);
      return;
    }
    if (attempt < 5) await sleep(3000);
  }
  throw new Error(`DB committed, but ${playUrl} still answers; the catalog refreshes within 5 minutes`);
}

// ---------- main ----------

try {
  if (command === "check") await check();
  else if (command === "publish") await publish();
  else if (command === "unlist") await unlist();
  else await switchVersion();
} catch (error) {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
