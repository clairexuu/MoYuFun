"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { logOut } from "@/lib/auth-actions";

const linkClass =
  "rounded-lg px-3 py-2 text-sm font-semibold text-[#aab4c8] transition hover:bg-white/[0.06] hover:text-white";

export function AccountMenu() {
  const [email, setEmail] = useState<string | null>();

  useEffect(() => {
    fetch("/api/me", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((body: { user: { email: string } | null }) => setEmail(body.user?.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  if (email === undefined) return null;

  if (email === null) {
    return (
      <Link className={linkClass} href="/login">
        登录
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Link className={linkClass} href="/me">
        {email.split("@")[0]}
      </Link>
      <form action={logOut}>
        <button className="rounded-lg px-2 py-2 text-xs text-[#7f8aa3] hover:text-white" type="submit">
          退出
        </button>
      </form>
    </span>
  );
}
