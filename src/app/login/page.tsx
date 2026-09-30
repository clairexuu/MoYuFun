import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { logIn, resendConfirmation } from "@/lib/auth-actions";
import { safeNext } from "@/lib/auth-request";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登录", robots: { index: false } };

const NOTICES: Record<string, string> = {
  link: "链接无效或已过期，请重新登录或再次申请。",
  resent: "验证邮件已重新发送，请查收。",
};

export default async function LogInPage(props: PageProps<"/login">) {
  const query = await props.searchParams;
  const next = safeNext(query.next);
  const notice = NOTICES[String(query.error ?? query.message ?? "")];

  return (
    <AuthShell title="登录">
      {notice ? <p className="mb-4 text-sm text-[#cbd3e3]">{notice}</p> : null}
      <AuthForm
        action={logIn}
        email
        password="current-password"
        resendAction={resendConfirmation}
        submitLabel="登录"
      >
        <input name="next" type="hidden" value={next} />
      </AuthForm>
      <p className="mt-6 flex justify-between text-sm text-[#7f8aa3]">
        <Link className="text-[#8fa4ff] hover:text-white" href="/forgot-password">忘记密码</Link>
        <Link className="text-[#8fa4ff] hover:text-white" href="/signup">注册账号</Link>
      </p>
    </AuthShell>
  );
}
