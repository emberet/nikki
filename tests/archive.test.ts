import test from "node:test";
import assert from "node:assert/strict";
import { solToLamports } from "../lib/quote";
import { archiveMetadata, archiveSizes } from "../lib/archive";
import { jsonBody } from "../lib/http";
test("Turbo decimal SOL prices convert exactly to lamports", () => {
  assert.equal(solToLamports("0.540367216"), 540367216n);
  assert.equal(solToLamports("1"), 1000000000n);
  assert.equal(solToLamports("0.000000001"), 1n);
  assert.equal(solToLamports("0.123"), 123000000n);
  for (const invalid of ["0", "-1", "NaN", "1e-9", "0.0000000001", ""])
    assert.throws(() => solToLamports(invalid));
});
test("large context and signed ballots fit a separate stable archive record", () => {
  const video: any = {
    id: "proposal",
    title: "A title",
    description: "史".repeat(5000),
    category: "History",
    language: "English",
    source: "source",
    creator: { wallet: "creator" },
    sizeBytes: 1000000000n,
    mimeType: "video/mp4",
    sha256: "f".repeat(64),
    yesCount: 4,
    noCount: 1,
    ballots: [
      { wallet: "z", message: "signed z", signature: "z" },
      { wallet: "a", message: "signed a", signature: "a" },
    ],
  };
  const one = archiveMetadata(video, "x".repeat(43));
  video.ballots.reverse();
  assert.equal(archiveMetadata(video, "x".repeat(43)), one);
  assert.deepEqual(archiveSizes(video), [1000000000, Buffer.byteLength(one)]);
  assert.equal(JSON.parse(one).description.length, 5000);
  assert.equal(JSON.parse(one).review.ballots[0].wallet, "a");
});
test("JSON bodies without Content-Length are still bounded while streaming", async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(33000));
      c.close();
    },
  });
  const request = new Request("http://local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(() => jsonBody(request), /Request too large/);
});
