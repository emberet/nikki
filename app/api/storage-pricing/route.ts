import { storagePricing } from "@/creator-worker/storage-pricing";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return storagePricing(request);
}
