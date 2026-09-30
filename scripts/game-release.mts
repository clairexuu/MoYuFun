// CLI: pnpm game <check|publish|switch> <slug> <version>. See docs/design/game-release.md.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";

import { checkPackage, type Package } from "./game-package.mts";

const GAMES_ROOT = path.resolve(import.meta.dirname, "../games");

const { positionals } = parseArgs({
  allowPositionals: true,
  options: {
    notes: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});
const [command, slug, version] = positionals;

if (!["check", "publish", "switch"].includes(command) || !slug || !version) {
  console.error(
    "usage: pnpm game check|publish|switch <slug> <version> [--notes <text>] [--yes]",
  );
  process.exit(2);
}

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

try {
  switch (command) {
    case "check":
      await check();
      break;
    default:
      throw new Error(`${command} is not implemented yet`);
  }
} catch (error) {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
