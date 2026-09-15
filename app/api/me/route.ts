import { requireUser } from "@/lib/session";
import { api, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = api(async () => {
  const { user } = await requireUser();
  return json({
    wallet: user.wallet,
    xUsername: user.xUsername,
    xLinked: !!user.xId,
    role: user.xId ? "moderator" : "creator",
  });
});
