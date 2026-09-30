import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { hardenCookie } from "@/lib/auth-request";

export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are not configured");
  }

  return { url, key };
}

export function siteUrl(): string {
  return new URL(process.env.SITE_URL?.trim() || "http://localhost:3000").origin;
}

export async function createSupabaseServerClient() {
  const { url, key } = supabaseEnv();
  const store = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, hardenCookie(options));
          }
        } catch {
          // Server Components cannot set cookies; the proxy refreshes sessions there.
        }
      },
    },
  });
}

export type CurrentUser = { id: string; email: string };

export async function getCurrentUser(): Promise<CurrentUser | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims || typeof claims.sub !== "string" || typeof claims.email !== "string") {
    return undefined;
  }

  return { id: claims.sub, email: claims.email };
}
