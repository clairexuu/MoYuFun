"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { trackBrowserEvent } from "@/lib/browser-events";
import {
  createGameLifecycle,
  readGameMessage,
} from "@/lib/game-events";

type GamePlayerProps = {
  detailHref: string;
  gameId: string;
  gameVersionId: string;
  path: string;
  src: string;
  title: string;
};

export function GamePlayer({
  detailHref,
  gameId,
  gameVersionId,
  path,
  src,
  title,
}: GamePlayerProps) {
  const playerRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lifecycleRef = useRef<{
    attempt: number;
    lifecycle: ReturnType<typeof createGameLifecycle>;
  }>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadingSlowly, setLoadingSlowly] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string>();

  useEffect(() => {
    if (ready) return;

    const controller = new AbortController();
    const slowTimer = window.setTimeout(() => {
      setLoadingSlowly(true);
    }, 10_000);

    void fetch(src, {
      cache: "no-store",
      mode: "cors",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Game request failed");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setLoadingSlowly(true);
      });

    return () => {
      controller.abort();
      window.clearTimeout(slowTimer);
    };
  }, [attempt, ready, src]);

  useLayoutEffect(() => {
    let state = lifecycleRef.current;
    if (!state || state.attempt !== attempt) {
      state = {
        attempt,
        lifecycle: createGameLifecycle({
          context: {
            game_id: gameId,
            game_version_id: gameVersionId,
            path,
          },
          track: trackBrowserEvent,
          now: Date.now,
          randomUUID: () => window.crypto.randomUUID(),
          isVisible: () => document.visibilityState === "visible",
          setInterval: (callback, milliseconds) =>
            window.setInterval(callback, milliseconds),
          clearInterval: (timer) => window.clearInterval(timer as number),
        }),
      };
      lifecycleRef.current = state;
      state.lifecycle.load();
    }

    const lifecycle = state.lifecycle;
    const gameOrigin = new URL(src).origin;
    function receiveGameMessage(event: MessageEvent) {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow) return;
      const type = readGameMessage(event, gameOrigin, frameWindow);
      if (!type) return;
      lifecycle.message(type);
      if (type === "ready") setReady(true);
    }

    window.addEventListener("message", receiveGameMessage);
    return () => {
      window.removeEventListener("message", receiveGameMessage);
      lifecycle.dispose();
    };
  }, [attempt, gameId, gameVersionId, path, src]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  function reloadGame() {
    setReady(false);
    setLoadingSlowly(false);
    setAttempt((currentAttempt) => currentAttempt + 1);
  }

  async function toggleFullscreen() {
    setFullscreenError(undefined);

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (!playerRef.current?.requestFullscreen) {
        throw new Error("当前浏览器不支持全屏模式");
      }

      await playerRef.current.requestFullscreen();
    } catch {
      setFullscreenError("无法进入全屏，请检查浏览器权限");
    }
  }

  return (
    <section className="game-player" ref={playerRef}>
      <div className="game-player__toolbar flex min-h-14 items-center gap-3 border border-white/[0.09] bg-[#111722] px-3 py-2 sm:rounded-t-2xl sm:px-4">
        <Link
          aria-label={`返回 ${title} 详情页`}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#aab4c8] transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8fa4ff]"
          href={detailHref}
        >
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">返回详情</span>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          <p className="hidden text-xs text-[#69758f] sm:block">键鼠游戏</p>
        </div>
        <button
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-[#c5cede] transition hover:border-[#7189ff]/50 hover:bg-[#7189ff]/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8fa4ff]"
          onClick={toggleFullscreen}
          type="button"
        >
          {isFullscreen ? "退出全屏" : "全屏"}
        </button>
      </div>

      <div className="game-player__mobile-note border-x border-white/[0.09] bg-[#151926] px-4 py-2.5 text-center text-xs leading-5 text-[#aeb8cc] md:hidden">
        当前游戏使用键盘和鼠标操作，建议在电脑端游玩。
      </div>

      <div className="game-frame-wrap">
        <iframe
          allow="fullscreen; autoplay"
          className="size-full border-0 bg-[#05070b]"
          key={attempt}
          ref={iframeRef}
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          src={src}
          title={`${title} 游戏画面`}
        />

        {!ready ? (
          <div
            aria-live="polite"
            className="absolute inset-0 grid place-items-center bg-[#080b12]/95 p-6 text-center backdrop-blur-sm"
          >
            {loadingSlowly ? (
              <div className="max-w-sm">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#7189ff]/30 bg-[#7189ff]/10 text-xl text-[#9aabff]">
                  !
                </div>
                <p className="mt-4 text-base font-semibold text-white">
                  游戏加载较慢
                </p>
                <p className="mt-2 text-sm leading-6 text-[#8f9ab0]">
                  请确认本地游戏服务已经启动，然后重新加载。
                </p>
                <button
                  className="mt-5 min-h-11 rounded-xl bg-[#6f8cff] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#8197ff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a9b6ff]"
                  onClick={reloadGame}
                  type="button"
                >
                  重新加载
                </button>
              </div>
            ) : (
              <div>
                <span className="mx-auto block size-9 animate-spin rounded-full border-2 border-white/15 border-t-[#8fa4ff]" />
                <p className="mt-4 text-sm font-medium text-[#b4bed1]">
                  游戏加载中…
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {fullscreenError ? (
        <p
          aria-live="polite"
          className="mt-3 text-center text-xs text-[#ff9ba8]"
        >
          {fullscreenError}
        </p>
      ) : null}
    </section>
  );
}
