"use client";

import { useActionState, useState } from "react";

import type { AuthState } from "@/lib/auth-actions";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-[#080b12] px-3 py-2.5 text-sm text-white outline-none focus:border-[#7189ff]";
const labelClass = "grid gap-2 text-xs font-medium text-[#98a2b8]";
const buttonClass =
  "min-h-11 w-full rounded-xl bg-[#6f8cff] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#8197ff] disabled:opacity-60";

type AuthFormProps = {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  submitLabel: string;
  email?: boolean;
  password?: "current-password" | "new-password";
  children?: React.ReactNode;
  resendAction?: (formData: FormData) => Promise<void>;
};

export function AuthForm({
  action,
  submitLabel,
  email,
  password,
  children,
  resendAction,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled so React's post-action form reset keeps the typed email after an error.
  const [emailValue, setEmailValue] = useState("");

  return (
    <form action={formAction} className="grid gap-4">
      {email ? (
        <label className={labelClass}>
          邮箱
          <input
            autoComplete="email"
            className={inputClass}
            name="email"
            onChange={(event) => setEmailValue(event.target.value)}
            required
            type="email"
            value={emailValue}
          />
        </label>
      ) : null}
      {password ? (
        <label className={labelClass}>
          {password === "new-password" ? "密码（至少 8 个字符）" : "密码"}
          <input
            autoComplete={password}
            className={inputClass}
            minLength={password === "new-password" ? 8 : undefined}
            name="password"
            required
            type="password"
          />
        </label>
      ) : null}
      {children}
      {state.error ? (
        <p aria-live="polite" className="text-sm text-[#ff9ba8]">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p aria-live="polite" className="text-sm text-[#9ee6b8]">
          {state.message}
        </p>
      ) : null}
      <button className={buttonClass} disabled={pending} type="submit">
        {submitLabel}
      </button>
      {state.unconfirmedEmail && resendAction ? (
        <button
          className="text-sm text-[#8fa4ff] hover:text-white"
          formAction={resendAction}
          formNoValidate
          type="submit"
        >
          重新发送验证邮件
        </button>
      ) : null}
    </form>
  );
}
