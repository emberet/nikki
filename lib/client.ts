export async function post(url: string, data: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await r.json();
  if (!r.ok)
    throw new Error(result.error || "This action could not be completed.");
  return result;
}
export function sizeLabel(bytes: string | number) {
  const n = Number(bytes);
  return n >= 1e9
    ? (n / 1e9).toFixed(2) + " GB"
    : n >= 1e6
      ? (n / 1e6).toFixed(1) + " MB"
      : (n / 1e3).toFixed(1) + " KB";
}
export function shortWallet(wallet: string) {
  return wallet.slice(0, 4) + "…" + wallet.slice(-4);
}
export function timeLeft(closes: string | null, now = Date.now()) {
  if (!closes) return "Waiting to open";
  const ms = Date.parse(closes) - now;
  if (ms <= 0) return "Voting closed";
  const hours = Math.floor(ms / 3600000),
    minutes = Math.floor((ms % 3600000) / 60000);
  return hours + "h " + minutes + "m left";
}
