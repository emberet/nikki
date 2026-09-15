ALTER TABLE creator_profiles ADD COLUMN avatar_id TEXT;
ALTER TABLE creator_profiles ADD COLUMN banner_id TEXT;
CREATE TABLE creator_assets (
  id TEXT PRIMARY KEY, wallet TEXT NOT NULL REFERENCES creator_users(wallet),
  kind TEXT NOT NULL CHECK(kind IN ('avatar','banner')), object_key TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 393216), width INTEGER NOT NULL, height INTEGER NOT NULL,
  created_at INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE creator_tickets (
  id TEXT PRIMARY KEY, wallet TEXT NOT NULL REFERENCES creator_users(wallet),
  category TEXT NOT NULL, target_handle TEXT NOT NULL DEFAULT '', target_wallet TEXT, target_mint TEXT,
  message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')),
  reply TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX creator_tickets_owner ON creator_tickets(wallet,created_at DESC);
CREATE INDEX creator_tickets_queue ON creator_tickets(status,created_at DESC);
CREATE TABLE creator_ops_audit (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL,
  detail TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE creator_flags (id INTEGER PRIMARY KEY CHECK(id=1), transactions_paused INTEGER NOT NULL DEFAULT 0 CHECK(transactions_paused IN (0,1)));
CREATE TABLE creator_library (
  wallet TEXT NOT NULL REFERENCES creator_users(wallet), record_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0 CHECK(position>=0), saved INTEGER NOT NULL DEFAULT 0 CHECK(saved IN (0,1)),
  updated_at INTEGER NOT NULL, PRIMARY KEY(wallet,record_id)
);
CREATE INDEX creator_library_recent ON creator_library(wallet,updated_at DESC);
CREATE INDEX creator_intents_status_time ON creator_intents(status,created_at DESC);

CREATE INDEX creator_assets_owner ON creator_assets(wallet,created_at);
CREATE TRIGGER creator_art_quota BEFORE INSERT ON creator_assets BEGIN
  SELECT (CASE WHEN (SELECT coalesce(sum(bytes),0) FROM creator_assets)+NEW.bytes > 67108864 THEN RAISE(ABORT,'ART_STORAGE_FULL') END);
END;

CREATE TRIGGER creator_library_quota BEFORE INSERT ON creator_library
WHEN NOT EXISTS(SELECT 1 FROM creator_library WHERE wallet=NEW.wallet AND record_id=NEW.record_id)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM creator_library WHERE wallet=NEW.wallet)>=500 THEN RAISE(ABORT,'LIBRARY_FULL') END);
END;

CREATE TRIGGER creator_art_owner_quota BEFORE INSERT ON creator_assets BEGIN
  SELECT (CASE WHEN (SELECT coalesce(sum(bytes),0) FROM creator_assets WHERE wallet=NEW.wallet)+NEW.bytes > 2097152 THEN RAISE(ABORT,'ART_OWNER_FULL') END);
END;
