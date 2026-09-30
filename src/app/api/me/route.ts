import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();

  return Response.json(
    { user: user ? { email: user.email } : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
