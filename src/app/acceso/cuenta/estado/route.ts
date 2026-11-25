import { authDatabase, sessionToken } from "@/lib/auth/web";
import { participantStatus } from "@/lib/participant/service";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function GET() {
  try {
    const state = await participantStatus(authDatabase(), await sessionToken());
    return Response.json(state, { headers, status: state ? 200 : 401 });
  } catch {
    return Response.json(null, { headers, status: 503 });
  }
}
