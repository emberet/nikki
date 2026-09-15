import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import { db } from "./db";

export type SessionData = {
  wallet?: string;
  userId?: string;
  role?: string;
  nonce?: string;
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(cookies(), {
    cookieName: "nikki_session",
    password: process.env.SESSION_SECRET!,
    cookieOptions: { secure: process.env.NODE_ENV === "production" },
  });
}

export function modWallets(): string[] {
  return (process.env.MOD_WALLETS || "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
}

export async function requireUser() {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthorized");
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new Error("unauthorized");
  return { session, user };
}

export async function requireMod() {
  const { session, user } = await requireUser();
  if (user.role !== "mod" && user.role !== "admin") throw new Error("forbidden");
  return { session, user };
}
