import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "使用条款" };

const h2 = "mt-10 text-xl font-semibold text-white";
const p = "mt-3 text-sm leading-7 text-[#98a2b8]";

export default function TermsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
        <h1 className="text-3xl font-bold text-white">使用条款</h1>
        <p className={p}>更新日期：2026 年 9 月 30 日。使用 MoYuFun（www.moyufuns.com）即表示你同意以下条款。</p>

        <h2 className={h2}>1. 服务内容</h2>
        <p className={p}>MoYuFun 提供可在浏览器中直接游玩的 HTML5 小游戏。游戏免费，不含付费项目。我们可能随时新增、更新或下架游戏。</p>

        <h2 className={h2}>2. 账号</h2>
        <p className={p}>注册时须提供本人可用的邮箱，并妥善保管密码。账号仅供本人使用，你需对账号下的操作负责。若发现账号被盗用，请尽快通过找回密码重置。</p>

        <h2 className={h2}>3. 成就</h2>
        <p className={p}>成就由游戏在你的浏览器中判定并记录到账号，仅供个人留念，不构成任何排名、奖励或权益。我们可能调整或下线成就规则。</p>

        <h2 className={h2}>4. 禁止行为</h2>
        <p className={p}>不得利用漏洞、脚本或伪造请求干扰服务、伪造成就或影响他人使用；不得对本站进行未经授权的抓取、攻击或反向工程。违反者我们可以限制或删除账号。</p>

        <h2 className={h2}>5. 免责声明</h2>
        <p className={p}>服务按「现状」提供，我们不保证不间断或无错误。因维护、故障或第三方服务原因导致的数据丢失或服务中断，我们不承担责任，但会尽力恢复。</p>

        <h2 className={h2}>6. 条款变更</h2>
        <p className={p}>我们可能更新本条款，更新后会修改本页的更新日期。继续使用即表示接受更新后的条款。</p>
      </main>
      <SiteFooter />
    </div>
  );
}
