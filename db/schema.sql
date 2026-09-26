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

-- The pool of Survivor contestants that users can draft onto their team.
CREATE TABLE IF NOT EXISTS contestants (
  id SERIAL PRIMARY KEY,
  contestant_name TEXT UNIQUE NOT NULL,
  -- This week's score, overwritten each week rather than kept as history —
  -- see the note on `teams.cumulative_score` below for how the running
  -- total is tracked separately.
  weekly_score INTEGER NOT NULL DEFAULT 0,
  -- true once a contestant is voted out of the show. They stay out of the
  -- draft pool (see the dashboard loader's contestant query) but are never
  -- removed from any team_members row that already picked them.
  eliminated BOOLEAN NOT NULL DEFAULT false,
  -- The week number this contestant most recently won individual immunity.
  -- NULL until they've won it at least once.
  immunity_win_week INTEGER,
  -- The week number this contestant was voted out. Only ever set once
  -- `eliminated` is true; NULL otherwise.
  week_eliminated INTEGER,
  -- true for the single contestant who actually wins the season. Distinct
  -- from team_members.is_ultimate_survivor, which is each fantasy team's
  -- *prediction* of who that will be.
  is_ultimate_survivor BOOLEAN NOT NULL DEFAULT false,
  -- Which in-show tribe/team this contestant currently belongs to.
  in_show_team TEXT
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

-- Join table linking a team to the contestants drafted onto it. The
-- composite primary key means a given contestant can only appear once per
-- team (inserting the same pair twice fails), but there's deliberately no
-- database-level cap on how many rows a team can have — the "exactly
-- TEAM_SIZE members" rule is enforced in application code (see
-- app/constants.ts and the dashboard action), not here.

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  -- Exactly one of a team's members is designated as its "Ultimate
  -- Survivor" pick (presumably scored differently from the rest of the
  -- roster). The unique index below is what actually enforces "at most one
  -- per team" at the database level — a boolean column alone wouldn't stop
  -- two rows in the same team both being marked true.
  is_ultimate_survivor BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (team_id, contestant_id)
);

-- A partial unique index (rather than a plain UNIQUE constraint) only
-- applies to rows where is_ultimate_survivor is true, so any number of
-- `false` rows per team are still allowed — just never more than one `true`.
CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_ultimate_survivor
  ON team_members (team_id)
  WHERE is_ultimate_survivor;

-- A user's predictions for a given week: who gets voted out, and which
-- in-show team wins the immunity challenge. One row per (user, week) — see
-- deadlines.server.ts's getCurrentWeekNumber for how "week" is computed —
-- so history accumulates across the season (used by the /scores page)
-- instead of being overwritten.
CREATE TABLE IF NOT EXISTS weekly_picks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  week_number INTEGER NOT NULL,
  predicted_eliminated_id INTEGER NOT NULL REFERENCES contestants(id),
  -- Immunity is currently won as an in-show team (see contestants.in_show_team),
  -- not by an individual, so this is predicted as a team name rather than a
  -- contestant id — see IN_SHOW_TEAMS in app/constants.ts for the allowed
  -- values, mirrored here at the database level.
  predicted_immunity_winner_team TEXT NOT NULL
    CHECK (predicted_immunity_winner_team IN ('yellow', 'purple')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_number)
);
