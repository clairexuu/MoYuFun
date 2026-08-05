import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-white/[0.07] bg-[#080b12]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:h-[72px] sm:px-8">
        <Link
          className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8fa4ff]"
          href="/"
        >
          <span className="grid size-9 place-items-center rounded-xl border border-[#7189ff]/40 bg-gradient-to-br from-[#26376f] to-[#121a35] text-sm font-black tracking-tighter text-white shadow-[0_0_28px_rgba(111,140,255,0.24)]">
            MF
          </span>
          <span className="text-lg font-bold tracking-tight text-white">
            MoYuFun
          </span>
        </Link>
        <span className="hidden text-sm text-[#7f8aa3] sm:block">
          无需下载 · 打开即玩
        </span>
      </div>
    </header>
  );
}
