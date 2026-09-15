import { getSession } from "@/lib/session";
import { api, sameOrigin, json } from "@/lib/http";
export const POST = api(async (req) => {
  sameOrigin(req);
  const session = await getSession();
  session.destroy();
  return json({ ok: true });
});
