import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import { db } from "./db";
import { HttpError } from "./http";
export type SessionData = {
  wallet?: string;
  userId?: string;
  challengeId?: string;
  xState?: string;
  xVerifier?: string;
  xWallet?: string;
  xChallengeId?: string;
};
export async function getSession(): Promise<IronSession<SessionData>> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError(
      503,
      "Sign-in is unavailable: the server session secret is not configured.",
    );
  return getIronSession<SessionData>(await cookies(), {
    cookieName: "nikki_session",
    password: secret,
    ttl: 60 * 60 * 24,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  });
}
export async function requireUser() {
  const session = await getSession();
  if (!session.userId || !session.wallet) throw new Error("unauthorized");
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.wallet !== session.wallet) throw new Error("unauthorized");
  return { session, user };
}
export async function requireMod() {
  const data = await requireUser();
  if (!data.user.xId) throw new Error("forbidden");
  return data;
}
