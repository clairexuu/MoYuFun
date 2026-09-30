import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { forgotPassword } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "找回密码", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="找回密码">
      <AuthForm action={forgotPassword} email submitLabel="发送重置邮件" />
      <p className="mt-6 text-sm text-[#7f8aa3]">
        <Link className="text-[#8fa4ff] hover:text-white" href="/login">返回登录</Link>
      </p>
    </AuthShell>
  );
}
