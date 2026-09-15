import { readBoundedBody } from "./request-body";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { HttpError } from "./http";
import { CHUNK_BYTES } from "./rules";
export function heldDir() {
  return path.resolve(process.env.HELD_DIR || "./held");
}
export function safeHeldPath(filePath: string) {
  const root = heldDir();
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(root + path.sep))
    throw new HttpError(400, "Invalid stored file.");
  return resolved;
}
export async function fileHash(filePath: string) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(safeHeldPath(filePath)))
    hash.update(chunk);
  return hash.digest("hex");
}
export async function boundedBytes(req: Request) {
  const bytes = await readBoundedBody(req, CHUNK_BYTES, 120000);
  if (!bytes.length) throw new HttpError(400, "Empty upload chunk.");
  return bytes;
}
export function sniffVideo(filePath: string) {
  const fd = fs.openSync(safeHeldPath(filePath), "r"),
    buf = Buffer.alloc(64);
  try {
    fs.readSync(fd, buf, 0, 64, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (buf.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return "video/webm";
  throw new HttpError(415, "Please upload an MP4 or WebM video.");
}
export function fileResponse(req: Request, filePath: string, mimeType: string) {
  const resolved = safeHeldPath(filePath),
    size = fs.statSync(resolved).size;
  let start = 0,
    end = size - 1,
    status = 200;
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": "bytes */" + size },
      });
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, size - suffix);
    } else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), size - 1);
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start
    )
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": "bytes */" + size },
      });
    status = 206;
  }
  const headers: Record<string, string> = {
    "Content-Type": mimeType,
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };
  if (status === 206)
    headers["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
  return new Response(
    Readable.toWeb(
      fs.createReadStream(resolved, { start, end }),
    ) as ReadableStream,
    { status, headers },
  );
}
