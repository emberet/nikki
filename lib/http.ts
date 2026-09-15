import { NextResponse } from "next/server";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}
export function appOrigin(req?: Request) {
  const configured = process.env.APP_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production")
    throw new HttpError(503, "The application origin has not been configured.");
  return req ? new URL(req.url).origin : "http://127.0.0.1:4900";
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== appOrigin(req))
    throw new HttpError(403, "This request must come from Nikki.");
}
export async function jsonBody(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "JSON required.");
  if (Number(req.headers.get("content-length") || 0) > 32_768)
    throw new HttpError(413, "Request too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Empty request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 32_768) {
      await reader.cancel();
      throw new HttpError(413, "Request too large.");
    }
    chunks.push(next.value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || typeof body !== "object") throw Error();
    return body;
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}
export function api(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError)
        return NextResponse.json(
          { error: e.message },
          {
            status: e.status,
            headers: { ...e.headers, "Cache-Control": "no-store" },
          },
        );
      if (
        e instanceof Error &&
        ["unauthorized", "forbidden"].includes(e.message)
      )
        return NextResponse.json(
          {
            error:
              e.message === "unauthorized"
                ? "Sign in to continue."
                : "You are not eligible for this action.",
          },
          { status: e.message === "unauthorized" ? 401 : 403 },
        );
      console.error(
        "Nikki request failed",
        e instanceof Error ? e.name : "Unknown error",
      );
      return NextResponse.json(
        { error: "This action could not be completed. Please try again." },
        { status: 500 },
      );
    }
  };
}
export function id(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new HttpError(400, "Invalid record.");
  return value;
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
