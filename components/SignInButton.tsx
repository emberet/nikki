"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";

export function useAuth() {
  const [me, setMe] = useState<{ wallet: string; role: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/me");
    setMe(r.ok ? await r.json() : null);
    setLoaded(true);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { me, loaded, refresh };
}

export default function SignInButton({ onAuthed }: { onAuthed?: () => void }) {
  const { publicKey, signMessage, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { me, refresh } = useAuth();
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (!publicKey || !signMessage) return;
    setBusy(true);
    try {
      const { nonce } = await (await fetch("/api/auth/nonce")).json();
      const msg = new TextEncoder().encode(`Sign in to ForeverVid\nNonce: ${nonce}`);
      const sig = await signMessage(msg);
      const r = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58(), signature: bs58.encode(sig) }),
      });
      if (r.ok) {
        await refresh();
        onAuthed?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
  };

  if (me)
    return (
      <button className="btn" onClick={logout}>
        {me.wallet.slice(0, 4)}…{me.wallet.slice(-4)} ({me.role}) — sign out
      </button>
    );
  if (!connected)
    return (
      <button className="btn btn-primary" onClick={() => setVisible(true)}>
        Connect wallet
      </button>
    );
  return (
    <button className="btn btn-primary" onClick={signIn} disabled={busy}>
      {busy ? "Signing…" : "Sign in"}
    </button>
  );
}
