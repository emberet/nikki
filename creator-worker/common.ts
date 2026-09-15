import bs58 from "bs58";
import type { Env } from "./types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const now = () => Math.floor(Date.now() / 1000);
export const random = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function hash(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function origin(env: Env) {
  return env.PUBLIC_ORIGIN || "https://nikki.run";
}
export function cookie(req: Request, name: string) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function setCookie(env: Env, name: string, value: string, age = 86400) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin(env).startsWith("https:") ? "; Secure" : ""}`;
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
}
export function wallet(value: unknown) {
  if (typeof value !== "string" || value.length > 44)
    throw new ApiError(400, "Choose a valid Solana wallet.");
  try {
    if (bs58.decode(value).length !== 32) throw Error();
  } catch {
    throw new ApiError(400, "Choose a valid Solana wallet.");
  }
  return value;
}
export async function body(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "JSON is required.");
  if (Number(req.headers.get("content-length") || 0) > 32768)
    throw new ApiError(413, "This request is too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Request is empty.");
  let size = 0;
  const parts: Uint8Array[] = [];
  let timeout = false;
  const timer = setTimeout(() => {
    timeout = true;
    void reader.cancel();
  }, 15000);
  try {
    while (true) {
      const next = await reader.read();
      if (timeout) throw new ApiError(408, "The request timed out.");
      if (next.done) break;
      size += next.value.length;
      if (size > 32768) {
        await reader.cancel();
        throw new ApiError(413, "This request is too large.");
      }
      parts.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw Error();
    return value as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "This request could not be read.");
  } finally {
    clearTimeout(timer);
  }
}
export function text(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== "string")
    throw new ApiError(400, `${label} is required.`);
  const result = value.trim();
  if (
    result.length < min ||
    result.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)
  )
    throw new ApiError(400, `${label} must be ${min}–${max} characters.`);
  return result;
}
export async function limit(
  env: Env,
  scope: string,
  subject: string,
  maximum: number,
  seconds = 60,
) {
  const bucket = Math.floor(now() / seconds),
    id = await hash(`${scope}:${subject}:${bucket}`);
  const row = await env.CREATORS_DB.prepare(
    "INSERT INTO creator_rates(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(id, (bucket + 1) * seconds)
    .first<{ count: number }>();
  if (!row || row.count > maximum)
    throw new ApiError(429, "Too many attempts. Please try again shortly.");
}
export function sameOrigin(req: Request, env: Env) {
  if (req.headers.get("origin") !== origin(env))
    throw new ApiError(403, "Open Nikki to perform this action.");
}
export function escape(value: unknown) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
