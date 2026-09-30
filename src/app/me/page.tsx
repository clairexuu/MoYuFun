import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { getCurrentUser } from "@/lib/auth";
import { logOut } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "我的账号", robots: { index: false } };

export default async function MePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/me");
  }

  return (
    <AuthShell title="我的账号">
      <p className="text-sm text-[#98a2b8]">已登录：{user.email}</p>
      <form action={logOut} className="mt-6">
        <button
          className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#c5cede] hover:bg-white/[0.06]"
          type="submit"
        >
          退出登录
        </button>
      </form>
    </AuthShell>
  );
}
