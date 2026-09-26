CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opaque session and verification tokens are stored only as hashes.
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expiry ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS email_change_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  new_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Fixed windows are updated atomically and shared by all web processes.
CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS bug_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  report TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'complete')),
  finalist_count INTEGER NOT NULL DEFAULT 3,
  draft_lock_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fantasy_players (
  id SERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tribes (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE (season_id, name)
);

CREATE TABLE IF NOT EXISTS contestants (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  tribe_id INTEGER REFERENCES tribes(id),
  final_placement INTEGER,
  idols BOOLEAN NOT NULL DEFAULT false,
  advantages TEXT,
  shot_in_the_dark BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (season_id, name)
);

CREATE TABLE IF NOT EXISTS episodes (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  episode_number INTEGER NOT NULL,
  air_date DATE,
  picks_lock_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'aired', 'scored')),
  immunity_type TEXT NOT NULL DEFAULT 'tribe'
    CHECK (immunity_type IN ('tribe', 'individual')),
  UNIQUE (season_id, episode_number)
);

CREATE TABLE IF NOT EXISTS contestant_episode_tribes (
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  PRIMARY KEY (episode_id, contestant_id)
);

CREATE TABLE IF NOT EXISTS draft_picks (
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  player_id INTEGER NOT NULL REFERENCES fantasy_players(id),
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  is_ultimate_pick BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (season_id, player_id, contestant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS draft_picks_one_ultimate_pick
  ON draft_picks (season_id, player_id)
  WHERE is_ultimate_pick;

CREATE TABLE IF NOT EXISTS weekly_picks (
  id SERIAL PRIMARY KEY,
  episode_id INTEGER NOT NULL REFERENCES episodes(id),
  player_id INTEGER NOT NULL REFERENCES fantasy_players(id),
  elimination_pick_id INTEGER REFERENCES contestants(id),
  immunity_tribe_pick_id INTEGER REFERENCES tribes(id),
  immunity_contestant_pick_id INTEGER REFERENCES contestants(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (episode_id, player_id)
);

CREATE TABLE IF NOT EXISTS reminder_emails_sent (
  episode_id INTEGER NOT NULL REFERENCES episodes(id),
  reminder_type TEXT NOT NULL
    CHECK (reminder_type IN ('monday', 'wednesday_morning', 'wednesday_last_chance')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (episode_id, reminder_type)
);

CREATE TABLE IF NOT EXISTS episode_results (
  episode_id INTEGER PRIMARY KEY REFERENCES episodes(id),
  finalized_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS episode_eliminations (
  episode_id INTEGER NOT NULL REFERENCES episode_results(episode_id) ON DELETE CASCADE,
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  PRIMARY KEY (episode_id, contestant_id)
);

CREATE TABLE IF NOT EXISTS episode_immunity_winners (
  id SERIAL PRIMARY KEY,
  episode_id INTEGER NOT NULL REFERENCES episode_results(episode_id) ON DELETE CASCADE,
  tribe_id INTEGER REFERENCES tribes(id),
  contestant_id INTEGER REFERENCES contestants(id),
  CHECK (
    (tribe_id IS NOT NULL AND contestant_id IS NULL)
    OR (tribe_id IS NULL AND contestant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS episode_immunity_winners_unique_tribe
  ON episode_immunity_winners (episode_id, tribe_id)
  WHERE tribe_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS episode_immunity_winners_unique_contestant
  ON episode_immunity_winners (episode_id, contestant_id)
  WHERE contestant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS episode_scoring (
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('elimination', 'immunity')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'void')),
  void_reason TEXT,
  CHECK (status <> 'void' OR (void_reason IS NOT NULL AND btrim(void_reason) <> '')),
  PRIMARY KEY (episode_id, category)
);

DO $$
DECLARE
  current_season_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM seasons) THEN
    INSERT INTO seasons (name, status, finalist_count)
    VALUES ('Survivor 51', 'active', 3);
  END IF;

  SELECT id INTO current_season_id FROM seasons ORDER BY id LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM tribes) THEN
    INSERT INTO tribes (season_id, name, color) VALUES
      (current_season_id, 'Yellow', 'yellow'),
      (current_season_id, 'Purple', 'purple');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM contestants) THEN
    INSERT INTO contestants (season_id, name) VALUES
      (current_season_id, 'Aaliyah'),
      (current_season_id, 'Rob'),
      (current_season_id, 'Brady'),
      (current_season_id, 'Patt'),
      (current_season_id, 'Linnea'),
      (current_season_id, 'Cristian'),
      (current_season_id, 'Sharonda'),
      (current_season_id, 'Jenna'),
      (current_season_id, 'Kristin'),
      (current_season_id, 'Ori'),
      (current_season_id, 'Lewis'),
      (current_season_id, 'Kilby'),
      (current_season_id, 'Carter'),
      (current_season_id, 'Alexis'),
      (current_season_id, 'Jelly'),
      (current_season_id, 'Eric'),
      (current_season_id, 'Maggie'),
      (current_season_id, 'Thien An'),
      (current_season_id, 'Michael'),
      (current_season_id, 'Ana'),
      (current_season_id, 'Deven');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM episodes) THEN
    INSERT INTO episodes (season_id, episode_number, air_date, picks_lock_at)
    VALUES (
      current_season_id,
      1,
      '2026-09-30',
      '2026-10-01T03:00:00.000Z'
    );
  END IF;

  INSERT INTO episode_scoring (episode_id, category)
  SELECT e.id, category
  FROM episodes e, unnest(ARRAY['elimination', 'immunity']) AS category
  ON CONFLICT (episode_id, category) DO NOTHING;
END $$;
