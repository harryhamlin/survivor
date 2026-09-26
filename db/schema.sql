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
-- design: you're drafting your guess at who reaches the end. `draft_lock_at`
-- is its own column (rather than piggybacking on some episode's
-- picks_lock_at, as an earlier version of this schema did) because the
-- first episode a season's fantasy game actually plays isn't necessarily
-- episode_number 1 — e.g. a season can start already a week in, with that
-- first week's boot recorded (so the contestant can't be drafted) but no
-- weekly picks ever collected for it. Nullable: null means the draft has no
-- lock yet and is treated as open (see isLocked in app/season.server.ts).
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'complete')),
  finalist_count INTEGER NOT NULL DEFAULT 3,
  draft_lock_at TIMESTAMPTZ
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
-- by hand) — and it only ever reflects a contestant's *current* tribe.
-- Historical, per-episode tribe membership (needed once tribes swap or
-- shuffle) lives in contestant_episode_tribes instead; any scoring or
-- display that cares what tribe someone was on *at a given past episode*
-- must read that table, not this column.
-- `final_placement` is the season-ending rank (1 = winner) used to award
-- the final-3/winner bonus (final_placement <= finalist_count) — it's a
-- separate concern from whether/when a contestant was voted out, which is
-- recorded per episode in episode_eliminations. A null final_placement is
-- not a stand-in for "still in the game": checking whether someone's been
-- eliminated means checking episode_eliminations, not this column, since a
-- contestant can be out of the game for many episodes before the season
-- (and final_placement) is decided. Ties are allowed here (no
-- UNIQUE(season_id, final_placement)) since a multi-boot episode can
-- eliminate more than one contestant at the same placement.
CREATE TABLE IF NOT EXISTS contestants (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  tribe_id INTEGER REFERENCES tribes(id),
  final_placement INTEGER,
  UNIQUE (season_id, name)
);

-- One row per episode of a season. `picks_lock_at` is a real stored instant
-- (rather than a computed/hardcoded deadline in app code) — the backend
-- just compares `now()` against it (see app/season.server.ts), so changing
-- an air date or lock time is a data edit, not a code change. (The draft
-- itself locks separately, at seasons.draft_lock_at — not necessarily tied
-- to any one episode's picks_lock_at.) `status` tracks an episode through
-- the pipeline the backend drives it through: airs, then its result gets
-- recorded — this is a coarse, episode-level lifecycle marker, independent
-- of episode_scoring's finer-grained, per-category pending/active/void
-- status below.
-- `immunity_type` is which kind of immunity this episode plays for —
-- pre-merge episodes are usually tribe immunity, post-merge ones individual
-- — and is what tells the backend whether to collect (and later grade) a
-- weekly_picks.immunity_tribe_pick_id or an immunity_contestant_pick_id for
-- this episode, and which of episode_immunity_winners.tribe_id /
-- contestant_id its winner rows should use.
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

-- A contestant's tribe at the immunity challenge in a given episode,
-- recorded per episode rather than relied on solely from contestants.tribe_id
-- (which only ever holds the *current* tribe) — so a tribe swap, shuffle, or
-- merge doesn't retroactively change which tribe a past episode's immunity
-- result (or a player's historical pick against it) is attributed to. Not
-- seeded: contestants currently start with no tribe assigned at all (see
-- the note on the seed data below), so there's no real historical
-- membership yet to record — rows here only make sense once tribes are
-- actually assigned by hand, episode by episode.
CREATE TABLE IF NOT EXISTS contestant_episode_tribes (
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  tribe_id INTEGER NOT NULL REFERENCES tribes(id),
  PRIMARY KEY (episode_id, contestant_id)
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
-- elimination_pick_id is nullable so a scheduled no-elimination episode can
-- still accept a submission without forcing a meaningless elimination
-- guess; immunity_tribe_pick_id and immunity_contestant_pick_id are both
-- nullable because exactly one applies per row, depending on that episode's
-- immunity_type. None of that — nor "a prediction is required whenever its
-- category is actually open for picks" (see episode_scoring below) — is
-- enforced here; the backend decides which column(s) a submission should
-- fill in, and whether one is currently required, from episodes.immunity_type
-- and episode_scoring.status.
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

-- Tracks which "you haven't made your picks yet" reminder emails have
-- already gone out for an episode, so db/sendReminderEmails.mjs (run
-- frequently via Heroku Scheduler, since Scheduler has no day-of-week
-- option of its own) doesn't send the same reminder twice if it happens to
-- run more than once inside that reminder's target hour.
CREATE TABLE IF NOT EXISTS reminder_emails_sent (
  episode_id INTEGER NOT NULL REFERENCES episodes(id),
  reminder_type TEXT NOT NULL
    CHECK (reminder_type IN ('monday', 'wednesday_morning', 'wednesday_last_chance')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (episode_id, reminder_type)
);

-- The parent row for an episode's actual outcome, recorded once it airs
-- (episode_id is the PK directly, rather than a separate serial id, since
-- the relationship to episodes is inherently 1:1). The outcome details
-- themselves live in their own tables below — episode_eliminations (zero,
-- one, or more boots) and episode_immunity_winners (one or more winning
-- tribes or individuals) — both referencing this table's episode_id with
-- ON DELETE CASCADE, so an episode's whole result can be entered or removed
-- as a unit. `finalized_at` marks that the *actual show outcome* is
-- complete and official, as opposed to a result still being entered —
-- it's independent of whether that outcome is actually scored for fantasy
-- points, which is governed per-category by episode_scoring.status below.
-- A finalized episode_results row (with its eliminations/winners) should
-- still exist even when a category ends up voided: the real outcome
-- happened and is worth keeping on record regardless of scoring.
CREATE TABLE IF NOT EXISTS episode_results (
  episode_id INTEGER PRIMARY KEY REFERENCES episodes(id),
  finalized_at TIMESTAMPTZ
);

-- Zero, one, or more contestants eliminated in an episode — replaces a
-- single eliminated_contestant_id column on episode_results, which could
-- represent neither a no-elimination episode (without an unwanted dummy
-- value) nor a double-boot episode (at all). A contestant counts as "out"
-- once they appear here for any episode; app/backend logic that walks this
-- table to derive elimination status doesn't need to change per row, just
-- check existence the same way it checked the old column.
CREATE TABLE IF NOT EXISTS episode_eliminations (
  episode_id INTEGER NOT NULL REFERENCES episode_results(episode_id) ON DELETE CASCADE,
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  PRIMARY KEY (episode_id, contestant_id)
);

-- One or more immunity winners for an episode — a tribe (or several) or an
-- individual (or several), depending on that episode's immunity_type.
-- Replaces the single winning_tribe_id/immunity_contestant_id columns
-- previously on episode_results, which could only hold one winner of one
-- kind. The CHECK below only enforces "exactly one of tribe_id/
-- contestant_id is set" on each row; it can't verify that the one set
-- matches the episode's immunity_type ('tribe' rows for a tribe-immunity
-- episode, 'individual' for an individual one) or that the tribe/contestant
-- referenced actually belongs to the same season as the episode — both are
-- integrity rules whatever writes these rows has to enforce itself (a
-- trigger, or application code), not something expressible as a plain
-- CHECK/FK here.
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

-- Two partial unique indexes (one per nullable winner column), rather than
-- one UNIQUE(episode_id, tribe_id, contestant_id) — that composite wouldn't
-- actually stop the same tribe (or contestant) being entered twice for the
-- same episode, since Postgres treats two NULLs in a UNIQUE constraint as
-- distinct rather than flagging the repeated non-null column as a conflict.
CREATE UNIQUE INDEX IF NOT EXISTS episode_immunity_winners_unique_tribe
  ON episode_immunity_winners (episode_id, tribe_id)
  WHERE tribe_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS episode_immunity_winners_unique_contestant
  ON episode_immunity_winners (episode_id, contestant_id)
  WHERE contestant_id IS NOT NULL;

-- Per-episode, per-category scoring control — every episode gets both an
-- 'elimination' and an 'immunity' row (seeded automatically below, and for
-- any episode added later), so the two can be independently graded or
-- voided rather than an episode only having one all-or-nothing scoring
-- state. This is a different axis entirely from episodes.status above:
-- that's the episode's own aired/not-aired lifecycle, this is specifically
-- about whether/how fantasy points get awarded.
--   'pending' — not graded yet; no points awarded either way.
--   'active'  — predictions are graded against the actual recorded outcome
--               (episode_eliminations / episode_immunity_winners).
--   'void'    — every player gets zero points for this category, no matter
--               what the actual outcome or their prediction was. Voiding
--               one category (say, a chaotic multi-boot elimination) never
--               affects the other (immunity) for the same episode, since
--               each category is its own row.
-- The actual outcome is still recorded in episode_eliminations /
-- episode_immunity_winners regardless of this status — void doesn't mean
-- "don't record what happened," only "don't score it."
CREATE TABLE IF NOT EXISTS episode_scoring (
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('elimination', 'immunity')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'void')),
  void_reason TEXT,
  -- Written to guard explicitly against a null void_reason: a naive
  -- `status <> 'void' OR btrim(void_reason) <> ''` would let status='void'
  -- through with a null void_reason, since a CHECK expression that
  -- evaluates to null (as `btrim(NULL) <> ''` does) counts as satisfied,
  -- not violated, in Postgres.
  CHECK (status <> 'void' OR (void_reason IS NOT NULL AND btrim(void_reason) <> '')),
  PRIMARY KEY (episode_id, category)
);

-- Seed a season, its two tribes, its contestant pool, and its first
-- episode — but only the first time each table is created (checking "is
-- this table empty" rather than unconditionally inserting) so this file is
-- safe to run more than once without duplicating rows or clobbering edits
-- made by hand afterward (e.g. assigning contestants to tribes, or adding
-- later episodes) — see the note at the top of this file. Deliberately not
-- seeded: contestant_episode_tribes (no real historical tribe memberships
-- exist yet, since contestants start with no tribe assignment at all) and
-- episode_eliminations/episode_immunity_winners/episode_results (no episode
-- has actually aired yet in the seed data).
DO $$
DECLARE
  current_season_id INTEGER;
BEGIN
  -- draft_lock_at is left null (draft treated as open) until it's set by
  -- hand — there's no way to derive a sensible default for it here.
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

  -- A placeholder first episode, an example of the shape the real data
  -- takes — edit or replace this by hand once the actual schedule is known.
  IF NOT EXISTS (SELECT 1 FROM episodes) THEN
    INSERT INTO episodes (season_id, episode_number, air_date, picks_lock_at)
    VALUES (
      current_season_id,
      1,
      '2026-09-30',
      '2026-10-01T03:00:00.000Z'
    );
  END IF;

  -- Every episode needs both scoring-category rows to exist so grading or
  -- voiding one is always an UPDATE, never a first-time INSERT. Unlike the
  -- "is the table empty" guards above, this has to run every time this file
  -- does — including against episodes added by hand well after the initial
  -- seed — so it's keyed on ON CONFLICT DO NOTHING per (episode, category)
  -- instead.
  INSERT INTO episode_scoring (episode_id, category)
  SELECT e.id, category
  FROM episodes e, unnest(ARRAY['elimination', 'immunity']) AS category
  ON CONFLICT (episode_id, category) DO NOTHING;
END $$;
