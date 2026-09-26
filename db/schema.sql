-- Full database schema for the app. Every statement uses IF NOT EXISTS /
-- ON CONFLICT-style guards so this file is safe to run repeatedly against
-- the same database (used both for local setup and, via db/migrate.mjs, as
-- Heroku's release-phase migration on every deploy). During testing, the
-- convention is to drop a table by hand and let this file recreate it from
-- scratch rather than writing ALTER statements to migrate its old shape.

-- Login accounts. One row per person who can sign in — by email, not a
-- separate username. Kept separate from fantasy_players (below) so "who can
-- log in" and "who's playing the game" are two different concerns — a
-- login never needs game data, and a player row is meaningless without one.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- bcrypt hash, never a plaintext password
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A "forgot password" email's reset link, one row per link ever issued.
-- Only a hash of the token is stored (the same reasoning as
-- users.password_hash) — the plaintext token exists only in the emailed
-- link itself, so a database leak alone can't be used to reset anyone's
-- password. `used_at` being set (or `expires_at` having passed) is what
-- invalidates a link; see app/passwordReset.server.ts for the actual
-- create/validate/consume logic, kept in the backend rather than here.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per season of the show. Everything else (tribes, contestants,
-- episodes) belongs to a season, so multiple seasons' data can coexist in
-- the same database without colliding. `finalist_count` is how many
-- contestants count as "reaching the end" for scoring purposes (see
-- ScoringMetricsModal) — it's also how many contestants a fantasy player
-- must draft (see draft_picks below), since those are the same number by
-- design: you're drafting your guess at who reaches the end.
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'complete')),
  finalist_count INTEGER NOT NULL DEFAULT 3
);

-- A fantasy player's game identity, separate from their login (users).
-- `user_id` is UNIQUE so a login maps to at most one player. Rows here are
-- created by the backend (see app/players.server.ts) the first time a login
-- needs one — signup, or an existing login's first dashboard visit — rather
-- than by a schema-level trigger.
CREATE TABLE IF NOT EXISTS fantasy_players (
  id SERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id)
);

-- An in-show tribe for a season (e.g. its name and color). Pre-merge
-- episodes predict immunity per-tribe (see
-- weekly_picks.immunity_tribe_pick_id and episodes.immunity_type) rather
-- than per-contestant, so this needs to be a real table with ids rather than
-- a hardcoded pair of color strings.
CREATE TABLE IF NOT EXISTS tribes (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE (season_id, name)
);

-- The pool of contestants for a season, draftable by fantasy players.
-- `tribe_id` is nullable since a freshly-seeded contestant has no tribe
-- assignment yet (see the note on the seed data below — tribes are assigned
-- by hand). `final_placement` is nullable until the contestant is out of the
-- game, at which point it's set to their finishing rank (1 = winner) — this
-- single column is what both marks a contestant as eliminated (non-null)
-- and drives "made the final N" scoring (final_placement <= finalist_count),
-- replacing the separate eliminated/week_eliminated/is_ultimate_survivor
-- booleans an earlier version of this schema had.
CREATE TABLE IF NOT EXISTS contestants (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  tribe_id INTEGER REFERENCES tribes(id),
  final_placement INTEGER,
  UNIQUE (season_id, name),
  UNIQUE (season_id, final_placement)
);

-- One row per episode of a season. `picks_lock_at` is a real stored instant
-- (rather than a computed/hardcoded deadline in app code) — the backend
-- just compares `now()` against it (see app/season.server.ts), so changing
-- an air date or lock time is a data edit, not a code change. The draft
-- itself locks at episode 1's picks_lock_at (there's no separate draft-lock
-- column). `status` tracks an episode through the pipeline the backend
-- drives it through: airs, then its result gets recorded and scored.
-- `immunity_type` is which kind of immunity this episode plays for —
-- pre-merge episodes are usually tribe immunity, post-merge ones individual
-- — and is what tells the backend whether to collect (and later grade) a
-- weekly_picks.immunity_tribe_pick_id or an immunity_contestant_pick_id for
-- this episode.
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

-- A fantasy player's draft for a season: which contestants they picked, and
-- which one is their "Ultimate Survivor" bonus pick. No `id` column and no
-- separate roster/team entity — the (season, player, contestant) triple is
-- the whole row, so a player can't draft the same contestant twice in a
-- season. The "exactly finalist_count picks" rule is enforced in
-- application code (the dashboard action), same as the ultimate-pick
-- validity rule, not here.
CREATE TABLE IF NOT EXISTS draft_picks (
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  player_id INTEGER NOT NULL REFERENCES fantasy_players(id),
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  is_ultimate_pick BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (season_id, player_id, contestant_id)
);

-- A partial unique index (rather than a plain UNIQUE constraint) only
-- applies to rows where is_ultimate_pick is true, so any number of `false`
-- rows per (season, player) are still allowed — just never more than one
-- `true`.
CREATE UNIQUE INDEX IF NOT EXISTS draft_picks_one_ultimate_pick
  ON draft_picks (season_id, player_id)
  WHERE is_ultimate_pick;

-- A fantasy player's predictions for a given episode: who gets voted out,
-- and who (or which tribe) wins immunity. One row per (episode, player) —
-- editing an episode's picks again overwrites them, but past episodes' rows
-- stay untouched, so history accumulates for the /leaderboard page.
-- immunity_tribe_pick_id and immunity_contestant_pick_id are both nullable
-- because exactly one applies per row, depending on that episode's
-- immunity_type — the backend (the dashboard action) is what decides which
-- one to fill in, this table doesn't enforce the exclusivity itself.
CREATE TABLE IF NOT EXISTS weekly_picks (
  id SERIAL PRIMARY KEY,
  episode_id INTEGER NOT NULL REFERENCES episodes(id),
  player_id INTEGER NOT NULL REFERENCES fantasy_players(id),
  elimination_pick_id INTEGER NOT NULL REFERENCES contestants(id),
  immunity_tribe_pick_id INTEGER REFERENCES tribes(id),
  immunity_contestant_pick_id INTEGER REFERENCES contestants(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (episode_id, player_id)
);

-- The actual outcome of an episode, recorded once it airs. This is what
-- weekly_picks gets checked against and what marks a contestant eliminated
-- (a contestant is "out" once they appear as some episode's
-- eliminated_contestant_id). One row per episode (episode_id is the PK
-- directly, rather than a separate serial id, since the relationship is
-- inherently 1:1). All three outcome columns are nullable so a result can be
-- entered incrementally (e.g. the boot is known before immunity is
-- confirmed) — winning_tribe_id and immunity_contestant_id are also
-- mutually exclusive in practice, the same way their weekly_picks
-- counterparts are, per that episode's immunity_type. `finalized_at` being
-- set is what marks the row as official rather than a draft-in-progress.
CREATE TABLE IF NOT EXISTS episode_results (
  episode_id INTEGER PRIMARY KEY REFERENCES episodes(id),
  eliminated_contestant_id INTEGER REFERENCES contestants(id),
  winning_tribe_id INTEGER REFERENCES tribes(id),
  immunity_contestant_id INTEGER REFERENCES contestants(id),
  finalized_at TIMESTAMPTZ
);

-- Seed a season, its two tribes, its contestant pool, and its first
-- episode — but only the first time each table is created (checking "is
-- this table empty" rather than unconditionally inserting) so this file is
-- safe to run more than once without duplicating rows or clobbering edits
-- made by hand afterward (e.g. assigning contestants to tribes, or adding
-- later episodes) — see the note at the top of this file.
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

  -- Episode 1's picks_lock_at is also the draft lock (see the comment on
  -- the episodes table) — carried over from the previous hardcoded
  -- TEAM_LOCK_DEADLINE: 8:00 PM Pacific on September 30, 2026.
  IF NOT EXISTS (SELECT 1 FROM episodes) THEN
    INSERT INTO episodes (season_id, episode_number, air_date, picks_lock_at)
    VALUES (
      current_season_id,
      1,
      '2026-09-30',
      '2026-10-01T03:00:00.000Z'
    );
  END IF;
END $$;
