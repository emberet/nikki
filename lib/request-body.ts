import { HttpError } from "./http";
export async function readBoundedBody(
  req: Request,
  maximum: number,
  timeoutMs = 30000,
) {
  if (Number(req.headers.get("content-length") || 0) > maximum)
    throw new HttpError(413, "Request too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Empty request.");
  const parts: Uint8Array[] = [];
  let size = 0,
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    while (true) {
      const next = await reader.read();
      if (timedOut)
        throw new HttpError(408, "The upload took too long. Please retry.");
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new HttpError(413, "Request too large.");
      }
      parts.push(next.value);
    }
    return Buffer.concat(parts);
  } finally {
    clearTimeout(timer);
  }
}
