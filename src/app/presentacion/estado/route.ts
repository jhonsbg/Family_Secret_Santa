import { authDatabase } from "@/lib/auth/web";
import { publicReveal } from "@/lib/reveal/snapshot";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request) {
  const credential = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "");
  if (!credential) return Response.json(null, { headers, status: 401 });
  try {
    const state = await publicReveal(authDatabase(), credential[1]);
    return Response.json(state, { headers, status: state ? 200 : 401 });
  } catch {
    return Response.json(null, { headers, status: 503 });
  }
}
