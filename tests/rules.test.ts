import test from "node:test";
import assert from "node:assert/strict";
import { voteResult, qualifies, MAX_UPLOAD_BYTES } from "../lib/rules";
import { validPaymentTransaction } from "../lib/solana";
test("publication requires quorum and exact 80 percent approval", () => {
  assert.equal(voteResult(4, 1), "approved");
  assert.equal(voteResult(3, 2), "rejected");
  assert.equal(voteResult(3, 0), "expired");
  assert.equal(voteResult(0, 0), "expired");
  assert.equal(voteResult(5, 1), "approved");
  assert.equal(voteResult(4, 2), "rejected");
  assert.equal(voteResult(79, 20), "rejected");
  assert.equal(voteResult(80, 19), "approved");
});
test("eligibility is strictly greater than ten million in raw token units", () => {
  for (const decimals of [0, 6, 9]) {
    const threshold = 10000000n * 10n ** BigInt(decimals);
    assert.equal(qualifies(threshold, decimals), false);
    assert.equal(qualifies(threshold + 1n, decimals), true);
    assert.equal(qualifies(threshold - 1n, decimals), false);
  }
  assert.equal(MAX_UPLOAD_BYTES, 1000000000);
});
const opts = {
  payer: "payer",
  recipient: "receiver",
  expectedLamports: 100n,
  reference: "nikki:unique",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date("2026-01-01T00:15:00Z"),
};
function payment(source = "payer", amount = 100, reference = "nikki:unique") {
  return {
    meta: { err: null },
    blockTime: Date.parse("2026-01-01T00:01:00Z") / 1000,
    transaction: {
      message: {
        accountKeys: [{ signer: true, pubkey: "payer" }],
        instructions: [
          {
            programId: "11111111111111111111111111111111",
            parsed: {
              type: "transfer",
              info: { source, destination: "receiver", lamports: amount },
            },
          },
          {
            programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
            parsed: reference,
          },
        ],
      },
    },
  };
}
test("payment is from the payer, for the exact quote and reference", () => {
  assert.equal(validPaymentTransaction(payment(), opts), true);
  assert.equal(validPaymentTransaction(payment("other"), opts), false);
  assert.equal(validPaymentTransaction(payment("payer", 99), opts), false);
  assert.equal(validPaymentTransaction(payment("payer", 101), opts), false);
  assert.equal(
    validPaymentTransaction(payment("payer", 100, "another-proposal"), opts),
    false,
  );
  const failed = payment();
  failed.meta.err = "failed" as any;
  assert.equal(validPaymentTransaction(failed, opts), false);
  const old = payment();
  old.blockTime -= 3600;
  assert.equal(validPaymentTransaction(old, opts), false);
  const future = payment();
  future.blockTime += 3600;
  assert.equal(validPaymentTransaction(future, opts), false);
});
