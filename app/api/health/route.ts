import { health } from "@/lib/health";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const h = await health();
    return json(
      { status: h.worker && h.diskAvailable ? "ready" : "degraded", ...h },
      h.worker && h.diskAvailable ? 200 : 503,
    );
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
