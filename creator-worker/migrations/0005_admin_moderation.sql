-- Founder moderation: reversible hiding of communities and channels.
ALTER TABLE communities ADD COLUMN state TEXT NOT NULL DEFAULT 'visible' CHECK(state IN ('visible','hidden'));
ALTER TABLE communities ADD COLUMN moderated_at INTEGER;
ALTER TABLE communities ADD COLUMN moderated_by TEXT;
ALTER TABLE creator_profiles ADD COLUMN moderated_at INTEGER;
ALTER TABLE creator_profiles ADD COLUMN moderated_by TEXT;
