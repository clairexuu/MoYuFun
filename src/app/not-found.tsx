import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <section className="w-full max-w-lg rounded-3xl border border-white/[0.09] bg-[#111722] p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.32)] sm:p-12">
        <p className="text-sm font-bold tracking-[0.24em] text-[#7f95ff]">404</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
          没找到这个游戏
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#98a2b8]">
          链接可能已经失效，回到首页看看现有的游戏吧。
        </p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#6f8cff] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#8197ff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a9b6ff]"
          href="/"
        >
          返回首页
        </Link>
      </section>
    </main>
  );
}
