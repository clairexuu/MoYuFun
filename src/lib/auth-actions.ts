"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/auth";
import { safeNext } from "@/lib/auth-request";

export type AuthState = {
  error?: string;
  message?: string;
  unconfirmedEmail?: string;
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 8) {
    return { error: "请输入邮箱，密码至少 8 个字符。" };
  }

  if (formData.get("consent") !== "on") {
    return { error: "请先阅读并同意隐私政策和使用条款。" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error && error.code === "email_address_invalid") {
    return { error: "邮箱格式不正确。" };
  }

  if (error && error.code === "over_email_send_rate_limit") {
    return { error: "发送过于频繁，请稍后再试。" };
  }

  // Existing accounts get the same message so sign-up cannot enumerate emails.
  if (error && error.code !== "user_already_exists" && error.code !== "email_exists") {
    return { error: "注册失败，请稍后再试。" };
  }

  return { message: "请查收验证邮件，点击邮件中的链接完成注册。" };
}

export async function logIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error?.code === "email_not_confirmed") {
    return { error: "邮箱尚未验证，请先查收验证邮件。", unconfirmedEmail: email };
  }

  if (error) {
    return { error: "邮箱或密码错误。" };
  }

  redirect(safeNext(formData.get("next")));
}

export async function resendConfirmation(formData: FormData): Promise<void> {
  const email = field(formData, "email");
  const next = safeNext(formData.get("next"));
  const supabase = await createSupabaseServerClient();

  if (email) {
    await supabase.auth.resend({ type: "signup", email });
  }

  redirect(`/login?message=resent&next=${encodeURIComponent(next)}`);
}

export async function forgotPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email");

  if (email) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email);
  }

  return { message: "如果该邮箱已注册，重置邮件已经发出，请查收。" };
}

export async function resetPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return { error: "密码至少 8 个字符。" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error?.code === "same_password") {
    return { error: "新密码不能与旧密码相同。" };
  }

  if (error) {
    return { error: "重置失败，请重新打开邮件中的链接。" };
  }

  redirect("/me");
}

export async function logOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
