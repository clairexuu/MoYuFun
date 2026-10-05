import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMOUFLAGE_STORAGE_KEY,
  disguiseIconHref,
  readCamouflagePreference,
  writeCamouflagePreference,
} from "../src/lib/camouflage.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

test("remembers the camouflage preference and survives broken storage", () => {
  const storage = memoryStorage();
  assert.equal(readCamouflagePreference(storage), false);
  writeCamouflagePreference(storage, true);
  assert.equal(storage.map.get(CAMOUFLAGE_STORAGE_KEY), "1");
  assert.equal(readCamouflagePreference(storage), true);
  writeCamouflagePreference(storage, false);
  assert.equal(readCamouflagePreference(storage), false);

  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readCamouflagePreference(broken), false);
  assert.doesNotThrow(() => writeCamouflagePreference(broken, true));
  assert.equal(readCamouflagePreference(undefined), false);
});

test("gives each disguise app an inline SVG icon", () => {
  for (const app of ["excel", "vscode"] as const) {
    const href = disguiseIconHref(app);
    assert.match(href, /^data:image\/svg\+xml,/);
    assert.match(decodeURIComponent(href), /<svg[\s\S]*<\/svg>/);
  }
  assert.notEqual(disguiseIconHref("excel"), disguiseIconHref("vscode"));
});
