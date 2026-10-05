import type { DisguiseApp } from "./game-events.ts";

// Play-page camouflage mode (docs/design/office-camouflage.md D3–D5, D9).

export const CAMOUFLAGE_STORAGE_KEY = "moyufun:camouflage";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readCamouflagePreference(storage: StorageLike | undefined): boolean {
  try {
    return storage?.getItem(CAMOUFLAGE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCamouflagePreference(
  storage: StorageLike | undefined,
  on: boolean,
): void {
  try {
    storage?.setItem(CAMOUFLAGE_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the preference just isn't remembered.
  }
}

// Generic marks, no vendor artwork (D9).
const ICONS: Record<DisguiseApp, string> = {
  excel:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#217346"/><path d="M8 9h16v14H8zM8 14h16M8 18.5h16M13.5 9v14M19 9v14" fill="none" stroke="#fff" stroke-width="1.6"/></svg>',
  vscode:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#007acc"/><text x="16" y="21.5" font-family="Menlo,Consolas,monospace" font-size="15" font-weight="700" text-anchor="middle" fill="#fff">{}</text></svg>',
};

export function disguiseIconHref(app: DisguiseApp): string {
  return `data:image/svg+xml,${encodeURIComponent(ICONS[app])}`;
}
