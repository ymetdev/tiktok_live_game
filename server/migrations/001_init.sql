CREATE TABLE channels (
  id         text PRIMARY KEY,
  name       text NOT NULL DEFAULT '',
  token_hash text NOT NULL UNIQUE,
  season     int  NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE players (
  user_id      text PRIMARY KEY,
  platform     text NOT NULL DEFAULT 'tiktok',
  handle       text NOT NULL DEFAULT '',
  nickname     text NOT NULL DEFAULT '',
  avatar_url   text NOT NULL DEFAULT '',
  level        int  NOT NULL DEFAULT 1,
  exp          int  NOT NULL DEFAULT 0,
  class        text NOT NULL DEFAULT 'novice',
  evo_tier     int  NOT NULL DEFAULT 0,
  aura_points  int  NOT NULL DEFAULT 0,
  aura_tier    int  NOT NULL DEFAULT 0,
  bonus_pct    real NOT NULL DEFAULT 0,
  wins         int  NOT NULL DEFAULT 0,
  matches      int  NOT NULL DEFAULT 0,
  kills        int  NOT NULL DEFAULT 0,
  damage       bigint NOT NULL DEFAULT 0,
  season       int  NOT NULL DEFAULT 1,
  pending_class boolean NOT NULL DEFAULT false,  -- class picked after the cutscene queue closed: its cutscene plays next round
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX players_rank ON players (level DESC, exp DESC);
CREATE TABLE live_sessions (
  id         bigserial PRIMARY KEY,
  channel    text NOT NULL REFERENCES channels(id),
  season     int  NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz
);
CREATE TABLE session_players (
  session_id bigint NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id    text   NOT NULL REFERENCES players(user_id),
  team       text   NOT NULL CHECK (team IN ('red','blue')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
CREATE TABLE matches (
  id         bigserial PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  idx        int    NOT NULL,
  seed       bigint NOT NULL,
  winner     text,
  reason     text,
  mvp_user   text,
  stats      jsonb  NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz,
  committed  boolean NOT NULL DEFAULT false
);
CREATE TABLE match_players (
  match_id     bigint NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id      text   NOT NULL,
  team         text   NOT NULL,
  class        text   NOT NULL,
  level_before int    NOT NULL,
  level_after  int    NOT NULL,
  exp_gain     int    NOT NULL,
  kills        int    NOT NULL DEFAULT 0,
  damage       int    NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, user_id)
);
CREATE TABLE gift_events (
  event_id     text PRIMARY KEY,                  -- dedupe key from the adapter
  channel      text NOT NULL,
  session_id   bigint,
  user_id      text NOT NULL,
  gift_id      text NOT NULL DEFAULT '',
  gift_name    text NOT NULL DEFAULT '',
  diamonds     int  NOT NULL DEFAULT 0,
  repeat_count int  NOT NULL DEFAULT 1,
  ts           timestamptz NOT NULL DEFAULT now(),
  match_id     bigint,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied'))
);
CREATE INDEX gift_pending ON gift_events (channel, status);
