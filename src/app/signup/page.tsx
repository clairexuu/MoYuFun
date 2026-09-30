import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { signUp } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "注册", robots: { index: false } };

export default function SignUpPage() {
  return (
    <AuthShell title="注册账号">
      <AuthForm action={signUp} email password="new-password" submitLabel="注册">
        <label className="flex items-start gap-2 text-sm text-[#98a2b8]">
          <input className="mt-1" name="consent" required type="checkbox" />
          <span>
            我已阅读并同意
            <Link className="text-[#8fa4ff] hover:text-white" href="/privacy">隐私政策</Link>
            和
            <Link className="text-[#8fa4ff] hover:text-white" href="/terms">使用条款</Link>
          </span>
        </label>
      </AuthForm>
      <p className="mt-6 text-sm text-[#7f8aa3]">
        已有账号？
        <Link className="text-[#8fa4ff] hover:text-white" href="/login">登录</Link>
      </p>
    </AuthShell>
  );
}
