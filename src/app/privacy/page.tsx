import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "隐私政策" };

const h2 = "mt-10 text-xl font-semibold text-white";
const p = "mt-3 text-sm leading-7 text-[#98a2b8]";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
        <h1 className="text-3xl font-bold text-white">隐私政策</h1>
        <p className={p}>更新日期：2026 年 9 月 30 日。本政策说明 MoYuFun（www.moyufuns.com）收集哪些数据、如何使用以及保留多久。</p>

        <h2 className={h2}>1. 匿名使用统计</h2>
        <p className={p}>为了解游戏是否好玩、加载是否顺畅，我们记录页面访问、游戏加载、开始、结束和游玩心跳等事件。浏览器会在本地存储一个随机的访客标识和会话标识，它们不含任何个人信息，也不与账号关联。请求 IP 只用于服务端限流，以加密哈希形式短暂保存，不写入事件数据。</p>
        <p className={p}>原始事件保留 30 天后删除；按日汇总的统计结果（如加载成功率）长期保留，但不包含任何可识别个人的字段。</p>

        <h2 className={h2}>2. 账号</h2>
        <p className={p}>注册账号需要提供邮箱和密码。邮箱用于验证身份、找回密码和登录；密码经加密处理后由 Supabase 身份服务保存，我们无法查看明文。账号数据仅用于保存你在游戏中解锁的成就，不会用于排名或公开展示，也不会用于营销。</p>
        <p className={p}>登录后浏览器会保存一个仅限本站、脚本不可读取的登录 Cookie，用于维持登录状态。</p>

        <h2 className={h2}>3. 成就</h2>
        <p className={p}>登录后，游戏中达成的成就会与你的账号一起保存，仅你本人可见。未登录时成就不会被保存。</p>

        <h2 className={h2}>4. 第三方服务</h2>
        <p className={p}>本站运行在 Vercel（网站托管）、Supabase（数据库与身份服务）、Cloudflare（游戏文件分发）和 Resend（验证与找回密码邮件）之上。这些服务只在提供上述功能所需的范围内处理数据。</p>

        <h2 className={h2}>5. 删除账号</h2>
        <p className={p}>你可以随时在「我的账号」页面删除账号。删除后邮箱、密码和全部成就记录会立即移除，且无法恢复。匿名统计不含账号信息，不受影响。</p>

        <h2 className={h2}>6. 联系我们</h2>
        <p className={p}>如有疑问，请通过 noreply@moyufuns.com 回信地址所在域名的站点入口联系我们。政策更新时会修改本页的更新日期。</p>
      </main>
      <SiteFooter />
    </div>
  );
}
