import { createSupabaseServerClient, siteUrl } from "@/lib/auth";
import { isConfirmType, safeNext } from "@/lib/auth-request";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const tokenHash = searchParams.get("token_hash");
  const next = safeNext(searchParams.get("next"));
  const headers = { "Cache-Control": "private, no-store" };

  if (isConfirmType(type) && tokenHash) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      return Response.redirect(new URL(next, siteUrl()), 303);
    }
  }

  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: new URL("/login?error=link", siteUrl()).toString() },
  });
}
