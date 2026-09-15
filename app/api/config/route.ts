import { releaseMode } from "@/lib/release";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  return json({
    releaseMode: releaseMode(),
    founderWallet: process.env.FOUNDER_WALLET || null,
    uploadsEnabled:
      releaseMode() === "local" || process.env.UPLOADS_ENABLED === "true",
    votingConfigured:
      releaseMode() !== "founder" &&
      !!process.env.TOKEN_MINT &&
      !!process.env.RPC_URL &&
      !!process.env.TREASURY_WALLET_HASH &&
      !!process.env.X_CLIENT_ID &&
      !!process.env.X_CLIENT_SECRET &&
      process.env.VOTING_ENABLED === "true",
    xConfigured: !!process.env.X_CLIENT_ID && !!process.env.X_CLIENT_SECRET,
    publishingConfigured:
      process.env.PUBLISHING_ENABLED === "true" &&
      (releaseMode() === "founder" || !!process.env.PAYMENT_WALLET) &&
      !!process.env.STORAGE_KEYPAIR_PATH,
    maxUploadBytes: 1000000000,
    votingHours: 24,
    minimumVoters: 5,
    approvalPercent: 80,
    paymentCurrency: "SOL",
  });
}
