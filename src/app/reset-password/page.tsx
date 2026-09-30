import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { getCurrentUser } from "@/lib/auth";
import { resetPassword } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "重置密码", robots: { index: false } };

export default async function ResetPasswordPage() {
  if (!(await getCurrentUser())) {
    redirect("/login?error=link");
  }

  return (
    <AuthShell title="设置新密码">
      <AuthForm action={resetPassword} password="new-password" submitLabel="保存新密码" />
    </AuthShell>
  );
}
