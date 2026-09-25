-- Full database schema for the app. Every statement uses IF NOT EXISTS /
-- ON CONFLICT-style guards so this file is safe to run repeatedly against
-- the same database (used both for local setup and, via db/migrate.mjs, as
-- Heroku's release-phase migration on every deploy).

-- Login accounts. One row per person who can sign in.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- bcrypt hash, never a plaintext password
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The pool of Survivor contestants that users can draft onto their team.
CREATE TABLE IF NOT EXISTS contestants (
  id SERIAL PRIMARY KEY,
  contestant_name TEXT UNIQUE NOT NULL
);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
