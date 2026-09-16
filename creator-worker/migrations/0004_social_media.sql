-- Free, removable community/channel images. Permanent video storage is separate.
CREATE TABLE content_assets (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL REFERENCES creator_users(wallet),
  kind TEXT NOT NULL CHECK(kind IN ('community-logo','community-banner','post-image')),
  object_key TEXT NOT NULL UNIQUE,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 524288),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 1600),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 1600),
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1,2)),
  created_at INTEGER NOT NULL
);
CREATE INDEX content_assets_owner ON content_assets(wallet,created_at);
ALTER TABLE communities ADD COLUMN logo_asset_id TEXT REFERENCES content_assets(id);
ALTER TABLE communities ADD COLUMN banner_asset_id TEXT REFERENCES content_assets(id);
ALTER TABLE communities ADD COLUMN banner_url TEXT NOT NULL DEFAULT '';
ALTER TABLE community_posts ADD COLUMN image_id TEXT REFERENCES content_assets(id);
ALTER TABLE community_posts ADD COLUMN image_alt TEXT NOT NULL DEFAULT '' CHECK(length(image_alt)<=240);
CREATE INDEX community_posts_image ON community_posts(image_id);
CREATE TABLE channel_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_wallet TEXT NOT NULL REFERENCES creator_profiles(wallet),
  wallet TEXT NOT NULL REFERENCES creator_users(wallet),
  client_id TEXT NOT NULL,
  text TEXT NOT NULL CHECK(length(text)<=2000),
  image_id TEXT REFERENCES content_assets(id),
  image_alt TEXT NOT NULL DEFAULT '' CHECK(length(image_alt)<=240),
  state TEXT NOT NULL DEFAULT 'visible' CHECK(state IN ('visible','deleted','hidden')),
  created_at INTEGER NOT NULL,
  moderated_at INTEGER, moderated_by TEXT,
  UNIQUE(wallet,client_id)
);
CREATE INDEX channel_posts_feed ON channel_posts(channel_wallet,state,id DESC);
CREATE INDEX channel_posts_wallet ON channel_posts(wallet);
CREATE INDEX channel_posts_image ON channel_posts(image_id);
CREATE TRIGGER content_assets_quota BEFORE INSERT ON content_assets BEGIN
  SELECT (CASE WHEN (SELECT coalesce(sum(bytes),0) FROM content_assets)+NEW.bytes>268435456 THEN RAISE(ABORT,'CONTENT_STORAGE_FULL') END);
  SELECT (CASE WHEN (SELECT coalesce(sum(bytes),0) FROM content_assets WHERE wallet=NEW.wallet)+NEW.bytes>20971520 THEN RAISE(ABORT,'CONTENT_OWNER_FULL') END);
END;
CREATE TRIGGER community_art_insert BEFORE INSERT ON communities BEGIN
  SELECT (CASE WHEN NEW.logo_asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_assets WHERE id=NEW.logo_asset_id AND wallet=NEW.owner_wallet AND kind='community-logo' AND ready=1) THEN RAISE(ABORT,'CONTENT_ASSET_INVALID') END);
  SELECT (CASE WHEN NEW.banner_asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_assets WHERE id=NEW.banner_asset_id AND wallet=NEW.owner_wallet AND kind='community-banner' AND ready=1) THEN RAISE(ABORT,'CONTENT_ASSET_INVALID') END);
END;
CREATE TRIGGER community_art_update BEFORE UPDATE OF logo_asset_id,banner_asset_id ON communities BEGIN
  SELECT (CASE WHEN NEW.logo_asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_assets WHERE id=NEW.logo_asset_id AND wallet=NEW.owner_wallet AND kind='community-logo' AND ready=1) THEN RAISE(ABORT,'CONTENT_ASSET_INVALID') END);
  SELECT (CASE WHEN NEW.banner_asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_assets WHERE id=NEW.banner_asset_id AND wallet=NEW.owner_wallet AND kind='community-banner' AND ready=1) THEN RAISE(ABORT,'CONTENT_ASSET_INVALID') END);
END;
CREATE TRIGGER community_post_image_insert BEFORE INSERT ON community_posts BEGIN
  SELECT (CASE WHEN NEW.image_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_assets WHERE id=NEW.image_id AND wallet=NEW.wallet AND kind='post-image' AND ready=1) THEN RAISE(ABORT,'CONTENT_ASSET_INVALID') END);
END;
CREATE TRIGGER community_post_image_update BEFORE UPDATE OF image_id ON community_posts BEGIN
  SELECT (CASE WHEN NEW.image_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_assets WHERE id=NEW.image_id AND wallet=NEW.wallet AND kind='post-image' AND ready=1) THEN RAISE(ABORT,'CONTENT_ASSET_INVALID') END);
END;
CREATE TRIGGER channel_post_image_insert BEFORE INSERT ON channel_posts BEGIN
  SELECT (CASE WHEN NEW.channel_wallet<>NEW.wallet THEN RAISE(ABORT,'CHANNEL_AUTHOR_INVALID') END);
  SELECT (CASE WHEN NEW.image_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_assets WHERE id=NEW.image_id AND wallet=NEW.wallet AND kind='post-image' AND ready=1) THEN RAISE(ABORT,'CONTENT_ASSET_INVALID') END);
END;
CREATE TRIGGER channel_post_image_update BEFORE UPDATE OF image_id ON channel_posts BEGIN
  SELECT (CASE WHEN NEW.image_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM content_assets WHERE id=NEW.image_id AND wallet=NEW.wallet AND kind='post-image' AND ready=1) THEN RAISE(ABORT,'CONTENT_ASSET_INVALID') END);
END;
CREATE TRIGGER channel_post_quota BEFORE INSERT ON channel_posts
WHEN NOT EXISTS(SELECT 1 FROM channel_posts WHERE wallet=NEW.wallet AND client_id=NEW.client_id)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM channel_posts)>=25000 THEN RAISE(ABORT,'CHANNEL_POSTS_FULL') END);
  SELECT (CASE WHEN (SELECT count(*) FROM channel_posts WHERE wallet=NEW.wallet)>=1000 THEN RAISE(ABORT,'CHANNEL_POSTS_OWNER_FULL') END);
END;
