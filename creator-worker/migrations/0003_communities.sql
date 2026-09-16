-- Free community conversations are removable off-chain database records.
-- Importing a community never alters creator_tokens, trading fees, or archival records.
CREATE TABLE communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint TEXT NOT NULL UNIQUE,
  owner_wallet TEXT NOT NULL REFERENCES creator_users(wallet),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=1000),
  logo_url TEXT NOT NULL DEFAULT '', website_url TEXT NOT NULL DEFAULT '',
  x_url TEXT NOT NULL DEFAULT '', telegram_url TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL CHECK(accent IN ('purple','lime','pink','blue')),
  token_name TEXT NOT NULL, token_symbol TEXT NOT NULL,
  metadata_uri TEXT NOT NULL DEFAULT '',
  import_role TEXT NOT NULL CHECK(import_role IN ('token-authority','community-led')),
  authority_wallet TEXT, authority_kind TEXT, authority_verified_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX communities_owner ON communities(owner_wallet);
CREATE TABLE community_members (
  mint TEXT NOT NULL REFERENCES communities(mint),
  wallet TEXT NOT NULL REFERENCES creator_users(wallet),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(mint,wallet)
);
CREATE INDEX community_members_wallet ON community_members(wallet);
CREATE TABLE community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint TEXT NOT NULL REFERENCES communities(mint),
  wallet TEXT NOT NULL REFERENCES creator_users(wallet),
  client_id TEXT NOT NULL,
  text TEXT NOT NULL CHECK(length(text)<=2000),
  state TEXT NOT NULL DEFAULT 'visible' CHECK(state IN ('visible','deleted','hidden')),
  created_at INTEGER NOT NULL,
  moderated_at INTEGER, moderated_by TEXT,
  UNIQUE(wallet,client_id)
);
CREATE INDEX community_posts_feed ON community_posts(mint,state,id DESC);
CREATE INDEX community_posts_wallet ON community_posts(wallet);
CREATE TRIGGER community_import_quota BEFORE INSERT ON communities BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM communities)>=2000 THEN RAISE(ABORT,'COMMUNITIES_FULL') END);
  SELECT (CASE WHEN (SELECT count(*) FROM communities WHERE owner_wallet=NEW.owner_wallet)>=10 THEN RAISE(ABORT,'COMMUNITIES_OWNER_FULL') END);
END;
CREATE TRIGGER community_membership_quota BEFORE INSERT ON community_members
WHEN NOT EXISTS(SELECT 1 FROM community_members WHERE mint=NEW.mint AND wallet=NEW.wallet)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM community_members)>=100000 THEN RAISE(ABORT,'COMMUNITY_MEMBERS_FULL') END);
  SELECT (CASE WHEN (SELECT count(*) FROM community_members WHERE wallet=NEW.wallet)>=200 THEN RAISE(ABORT,'COMMUNITY_MEMBERS_OWNER_FULL') END);
END;
CREATE TRIGGER community_post_quota BEFORE INSERT ON community_posts
WHEN NOT EXISTS(SELECT 1 FROM community_posts WHERE wallet=NEW.wallet AND client_id=NEW.client_id)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM community_posts)>=25000 THEN RAISE(ABORT,'COMMUNITY_POSTS_FULL') END);
  SELECT (CASE WHEN (SELECT count(*) FROM community_posts WHERE mint=NEW.mint)>=5000 THEN RAISE(ABORT,'COMMUNITY_FEED_FULL') END);
  SELECT (CASE WHEN (SELECT count(*) FROM community_posts WHERE wallet=NEW.wallet)>=1000 THEN RAISE(ABORT,'COMMUNITY_POSTS_OWNER_FULL') END);
END;
