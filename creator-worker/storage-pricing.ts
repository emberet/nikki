import { getStorageRate } from "../lib/storage-rate";

export async function storagePricing(req: Request): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (req.method !== "GET") {
    return Response.json(
      { error: "Use GET to view storage estimates." },
      { status: 405, headers: { ...headers, Allow: "GET" } },
    );
  }
  try {
    const rate = await getStorageRate();
    return Response.json(rate, {
      headers: { ...headers, "Cache-Control": "public, max-age=60" },
    });
  } catch {
    return Response.json(
      {
        error: "Live storage estimates are taking a break. Try again shortly.",
      },
      { status: 503, headers: { ...headers, "Retry-After": "30" } },
    );
  }
}
