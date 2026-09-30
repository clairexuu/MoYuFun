import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.07] py-8 text-center text-sm text-[#69758f]">
      MoYuFun · HTML5 小游戏 ·{" "}
      <Link className="hover:text-white" href="/privacy">隐私政策</Link> ·{" "}
      <Link className="hover:text-white" href="/terms">使用条款</Link>
    </footer>
  );
}
