export interface Statement {
  bind(...args: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface Env {
  CREATORS_DB: Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  PUBLIC_ORIGIN?: string;
  RPC_URL?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  TOKEN_LAUNCH_ENABLED?: string;
  FOUNDER_WALLET?: string;
  NIKKI_MINT?: string;
  TREASURY_WALLET_HASH?: string;
  CREATOR_MEDIA?: {
    put(
      key: string,
      value: ArrayBuffer | Uint8Array,
      options?: unknown,
    ): Promise<unknown>;
    get(
      key: string,
    ): Promise<{ body: ReadableStream; httpEtag: string } | null>;
    delete(key: string): Promise<void>;
  };
}
export interface CreatorUser {
  wallet: string;
  x_id: string | null;
  x_username: string | null;
  x_linked_at: number | null;
  created_at: number;
}
export interface Profile {
  wallet: string;
  handle: string;
  display_name: string;
  bio: string;
  category: string;
  accent: string;
  published: number;
  created_at: number;
  updated_at: number;
}
export interface CreatorToken {
  mint: string;
  wallet: string;
  name: string;
  symbol: string;
  description: string;
  accent: string;
  x_username: string;
  metadata_uri: string;
  status: string;
  created_at: number;
  verified_at: number | null;
  launch_signature: string | null;
}
export interface Intent {
  id: string;
  wallet: string;
  kind: string;
  mint: string | null;
  message_hash: string;
  unsigned_tx: string;
  blockhash: string;
  last_valid_height: number;
  estimated_lamports: string;
  created_at: number;
  signature: string | null;
  signed_tx: string | null;
  status: string;
}
