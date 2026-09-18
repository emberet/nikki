"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
type Me = {
  wallet: string;
  role: string;
  xLinked: boolean;
  xUsername: string | null;
};
type Auth = { me: Me | null; loaded: boolean; refresh: () => Promise<void> };
const Context = createContext<Auth>({
  me: null,
  loaded: false,
  refresh: async () => {},
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null),
    [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me");
      setMe(r.ok ? await r.json() : null);
    } catch {
      setMe(null);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return (
    <Context.Provider value={{ me, loaded, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  return useContext(Context);
}
export default function SignInButton({ onAuthed }: { onAuthed?: () => void }) {
  const { publicKey, signMessage, connected, connecting, wallet, disconnect } =
      useWallet(),
    { setVisible } = useWalletModal(),
    { me, refresh } = useAuth(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const adapter = wallet?.adapter;
    if (!adapter) return;
    const onError = (e: Error) =>
      setError(e.message || "The wallet connection failed. Please try again.");
    adapter.on("error", onError);
    return () => {
      adapter.off("error", onError);
    };
  }, [wallet]);
  const signIn = async () => {
    if (!publicKey || !signMessage) return;
    setBusy(true);
    setError("");
    try {
      const nr = await fetch("/api/auth/nonce");
      const challenge = await nr.json();
      if (!nr.ok) throw Error(challenge.error);
      const sig = await signMessage(
        new TextEncoder().encode(challenge.message),
      );
      const r = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          signature: bs58.encode(sig),
        }),
      });
      if (!r.ok) throw Error((await r.json()).error);
      await refresh();
      onAuthed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in cancelled.");
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await disconnect();
      await refresh();
      onAuthed?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      {me ? (
        <button
          className="btn btn-small"
          onClick={logout}
          disabled={busy}
          title="Sign out"
        >
          {me.wallet.slice(0, 4)}…{me.wallet.slice(-4)} ↗
        </button>
      ) : !connected ? (
        <button
          className="btn btn-primary btn-small"
          onClick={() => {
            setError("");
            setVisible(true);
          }}
          disabled={connecting}
        >
          {connecting ? "Connecting…" : "Connect wallet ↗"}
        </button>
      ) : (
        <button
          className="btn btn-primary btn-small"
          onClick={signIn}
          disabled={busy || !signMessage}
        >
          {busy ? "Signing…" : "Sign in →"}
        </button>
      )}
      {error && (
        <div role="alert" className="wallet-error">
          {error}
        </div>
      )}
    </div>
  );
}
