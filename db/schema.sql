-- Full database schema for the app. Every statement uses IF NOT EXISTS /
-- ON CONFLICT-style guards so this file is safe to run repeatedly against
-- the same database (used both for local setup and, via db/migrate.mjs, as
-- Heroku's release-phase migration on every deploy).

-- Login accounts. One row per person who can sign in.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- bcrypt hash, never a plaintext password
  email TEXT UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- `ADD COLUMN IF NOT EXISTS` (rather than only listing the columns above) is
-- what actually applies this to a database that already has the `users`
-- table from before these columns existed — the CREATE TABLE above only ever
-- runs the very first time the table is created. Both are nullable at the
-- database level (the pre-existing `test` user has neither) — the sign-up
-- form is what actually requires them going forward.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

-- The pool of Survivor contestants that users can draft onto their team.
CREATE TABLE IF NOT EXISTS contestants (
  id SERIAL PRIMARY KEY,
  contestant_name TEXT UNIQUE NOT NULL,
  -- This week's score, overwritten each week rather than kept as history —
  -- see the note on `teams.cumulative_score` below for how the running
  -- total is tracked separately.
  weekly_score INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE contestants ADD COLUMN IF NOT EXISTS weekly_score INTEGER NOT NULL DEFAULT 0;

-- Seed the contestant pool, but only the first time this table is created —
-- checking "is the table empty" (rather than unconditionally inserting) is
-- what makes this safe to re-run without duplicating rows or clobbering any
-- edits made directly in the database later.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM contestants) THEN
    INSERT INTO contestants (contestant_name) VALUES
      ('Aaliyah'),
      ('Rob'),
      ('Brady'),
      ('Patt'),
      ('Linnea'),
      ('Cristian'),
      ('Sharonda'),
      ('Jenna'),
      ('Kristin'),
      ('Ori'),
      ('Lewis'),
      ('Kilby'),
      ('Carter'),
      ('Alexis'),
      ('Jelly'),
      ('Eric'),
      ('Maggie'),
      ('Thien An'),
      ('Michael'),
      ('Ana'),
      ('Deven');
  END IF;
END $$;

-- One team per user. `user_id` is UNIQUE so a user can never end up with a
-- second team — the app enforces "pick your team once" by relying on this
-- constraint (see the dashboard route's action).
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  -- Running total across all weeks. This isn't computed on the fly from
  -- contestants.weekly_score because that column only ever holds the
  -- *current* week's numbers — once a new week's scores overwrite it, last
  -- week's contribution would be lost unless it's already been folded in
  -- here. Whatever process updates weekly_score each week is expected to
  -- add that week's points into each affected team's cumulative_score at
  -- the same time.
  cumulative_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS cumulative_score INTEGER NOT NULL DEFAULT 0;

-- Join table linking a team to the contestants drafted onto it. The
-- composite primary key means a given contestant can only appear once per
-- team (inserting the same pair twice fails), but there's deliberately no
-- database-level cap on how many rows a team can have — the "exactly 5
-- members" rule is enforced in application code (see app/constants.ts and
-- the dashboard action), not here.
CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  PRIMARY KEY (team_id, contestant_id)
);
