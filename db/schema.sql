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
  player_ids INTEGER[],
  PRIMARY KEY (episode_id, reminder_type)
);

-- Historical reminders have unknown recipients; new sends record their IDs.
ALTER TABLE reminder_emails_sent ADD COLUMN IF NOT EXISTS player_ids INTEGER[];

CREATE TABLE IF NOT EXISTS episode_results (
  episode_id INTEGER PRIMARY KEY REFERENCES episodes(id),
  finalized_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS episode_eliminations (
  episode_id INTEGER NOT NULL REFERENCES episode_results(episode_id) ON DELETE CASCADE,
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  counts_for_scoring BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (episode_id, contestant_id)
);

ALTER TABLE episode_eliminations
  ADD COLUMN IF NOT EXISTS counts_for_scoring BOOLEAN NOT NULL DEFAULT true;

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

-- Standalone contestant statistics: deliberately no foreign keys or table links.
-- NULL means unknown or inapplicable; percentages are fractions (0.5 = 50%).
-- Formula-based metrics are stored values, allowing imported source statistics.
CREATE TABLE IF NOT EXISTS survivor_stats (
  id SERIAL PRIMARY KEY,
  survival_average NUMERIC,
  survival_score NUMERIC,
  score_without_jury NUMERIC,
  challenge_wins NUMERIC,
  challenge_appearances NUMERIC,
  challenge_win_percent NUMERIC,
  challenge_sit_outs INTEGER,
  mean_percent_finish NUMERIC,
  individual_reward_appearances INTEGER,
  individual_reward_wins INTEGER,
  individual_immunity_appearances INTEGER,
  individual_immunity_wins INTEGER,
  individual_challenge_appearances INTEGER,
  individual_challenge_wins INTEGER,
  individual_challenge_win_percent NUMERIC,
  team_reward_appearances INTEGER,
  team_reward_wins INTEGER,
  team_immunity_appearances INTEGER,
  team_immunity_wins INTEGER,
  team_challenge_appearances INTEGER,
  team_challenge_wins INTEGER,
  team_challenge_win_percent NUMERIC,
  team_challenge_second_places INTEGER,
  team_challenge_third_places INTEGER,
  hero_challenge_wins INTEGER,
  hero_challenge_appearances INTEGER,
  votes_for_eliminated_player INTEGER,
  votes_against_player INTEGER,
  total_tribal_votes INTEGER,
  tribal_council_voting_appearances INTEGER,
  tribal_council_success_percent NUMERIC,
  weighted_tribal_council_ratio NUMERIC,
  vote_free_tribals INTEGER,
  votes_not_for_eliminated_player INTEGER,
  vote_for_eliminated_player_percent NUMERIC,
  vote_not_for_eliminated_player_percent NUMERIC,
  tribals_with_votes_against INTEGER,
  tribals_with_votes_against_percent NUMERIC,
  non_immune_vote_free_tribals INTEGER,
  non_immune_vote_free_tribals_percent NUMERIC,
  votes_voided_by_idols INTEGER,
  intended_votes_against_player INTEGER,
  jury_votes_received INTEGER,
  total_jury_votes INTEGER,
  jury_vote_percent NUMERIC,
  days_played INTEGER,
  finish_position INTEGER,
  times_played INTEGER,
  exile_days_played INTEGER
);

COMMENT ON COLUMN survivor_stats.survival_average IS 'SurvAv: Challenge wins + weighted Tribal Council ratio + (6 * jury vote percent).';
COMMENT ON COLUMN survivor_stats.survival_score IS 'SurvSc: Challenge win percent + Tribal Council success percent + jury vote percent; maximum 3.';
COMMENT ON COLUMN survivor_stats.score_without_jury IS 'NoJ: Challenge wins + weighted Tribal Council ratio.';
COMMENT ON COLUMN survivor_stats.challenge_wins IS 'ChW: Individual wins earn 1; tribal/team wins earn 1/team size for participants, excluding sit-outs. Second place earns half credit.';
COMMENT ON COLUMN survivor_stats.challenge_appearances IS 'ChA: Individual appearances earn 1; tribal/team appearances earn 1/team size, including present sit-outs.';
COMMENT ON COLUMN survivor_stats.challenge_win_percent IS 'ChW%: Challenge wins / challenge appearances.';
COMMENT ON COLUMN survivor_stats.challenge_sit_outs IS 'SO: Official pre-challenge sit-outs; excludes players physically absent, including exile.';
COMMENT ON COLUMN survivor_stats.mean_percent_finish IS 'MPF: Mean individual finish fraction, (participants - placement + 1) / participants. Voluntary sit-outs earn zero; mandated New Era rice sit-outs are excluded. Hero challenges excluded.';
COMMENT ON COLUMN survivor_stats.individual_reward_appearances IS 'InRCA: Individual reward challenges competed in or present for.';
COMMENT ON COLUMN survivor_stats.individual_reward_wins IS 'InRCW: Individual reward challenges won.';
COMMENT ON COLUMN survivor_stats.individual_immunity_appearances IS 'InICA: Individual immunity challenges competed in or present for.';
COMMENT ON COLUMN survivor_stats.individual_immunity_wins IS 'InICW: Individual immunity challenges won.';
COMMENT ON COLUMN survivor_stats.individual_challenge_appearances IS 'InChA: Individual reward appearances + individual immunity appearances.';
COMMENT ON COLUMN survivor_stats.individual_challenge_wins IS 'InChW: Individual reward wins + individual immunity wins.';
COMMENT ON COLUMN survivor_stats.individual_challenge_win_percent IS 'InChW%: Individual challenge wins / individual challenge appearances.';
COMMENT ON COLUMN survivor_stats.team_reward_appearances IS 'TRCA: Tribal/team reward challenges competed in or present for.';
COMMENT ON COLUMN survivor_stats.team_reward_wins IS 'TRCW: Tribal/team reward challenges won; excludes sit-outs.';
COMMENT ON COLUMN survivor_stats.team_immunity_appearances IS 'TICA: Tribal/team immunity challenges competed in or present for.';
COMMENT ON COLUMN survivor_stats.team_immunity_wins IS 'TICW: Tribal/team immunity challenges won; excludes sit-outs.';
COMMENT ON COLUMN survivor_stats.team_challenge_appearances IS 'TChA: Tribal/team reward appearances + tribal/team immunity appearances.';
COMMENT ON COLUMN survivor_stats.team_challenge_wins IS 'TChW: Tribal/team reward wins + tribal/team immunity wins.';
COMMENT ON COLUMN survivor_stats.team_challenge_win_percent IS 'TChW%: Tribal/team challenge wins / tribal/team challenge appearances.';
COMMENT ON COLUMN survivor_stats.team_challenge_second_places IS 'TrCh 2nd: Tribal/team second-place finishes that earn immunity or reward.';
COMMENT ON COLUMN survivor_stats.team_challenge_third_places IS 'TrCh 3rd: Tribal/team third-place finishes that earn immunity or reward.';
COMMENT ON COLUMN survivor_stats.hero_challenge_wins IS 'HCW: Hero challenge wins; excluded from mean percent finish.';
COMMENT ON COLUMN survivor_stats.hero_challenge_appearances IS 'HCA: Hero challenges participated in, typically involving one or two representatives per tribe.';
COMMENT ON COLUMN survivor_stats.votes_for_eliminated_player IS 'VFB: Times voting for the eliminated player; first voting round only, excluding revotes.';
COMMENT ON COLUMN survivor_stats.votes_against_player IS 'VAP: First-round votes against the player, excluding votes voided by idols.';
COMMENT ON COLUMN survivor_stats.total_tribal_votes IS 'TotV: Total first-round votes cast at the relevant Tribal Councils, including votes voided by idols.';
COMMENT ON COLUMN survivor_stats.tribal_council_voting_appearances IS 'TCA: Tribal Councils at which the player cast a vote; no credit when their vote was stolen or lost.';
COMMENT ON COLUMN survivor_stats.tribal_council_success_percent IS 'TC%: (Votes for eliminated player - [votes against player / total Tribal votes]) / Tribal Council voting appearances.';
COMMENT ON COLUMN survivor_stats.weighted_tribal_council_ratio IS 'wTCR: (28 * votes for eliminated player) / ((votes against player + 4) * Tribal Council voting appearances); maximum 7.';
COMMENT ON COLUMN survivor_stats.vote_free_tribals IS 'VFT: Tribals at which the player voted without receiving any votes, including while immune. Votes voided by idols still disqualify a Tribal.';
COMMENT ON COLUMN survivor_stats.votes_not_for_eliminated_player IS 'nonVFB: First-round votes for someone other than the eliminated player, including planned split votes.';
COMMENT ON COLUMN survivor_stats.vote_for_eliminated_player_percent IS 'VFB%: Votes for eliminated player / Tribal Council voting appearances.';
COMMENT ON COLUMN survivor_stats.vote_not_for_eliminated_player_percent IS 'nVFB%: Votes not for eliminated player / Tribal Council voting appearances.';
COMMENT ON COLUMN survivor_stats.tribals_with_votes_against IS 'TVA: Tribal Council voting appearances - vote-free Tribals.';
COMMENT ON COLUMN survivor_stats.tribals_with_votes_against_percent IS 'VAT%: Tribals with votes against / Tribal Council voting appearances.';
COMMENT ON COLUMN survivor_stats.non_immune_vote_free_tribals IS 'NI VFT: Vote-free Tribals - individual immunity wins.';
COMMENT ON COLUMN survivor_stats.non_immune_vote_free_tribals_percent IS 'NI VFT%: (Vote-free Tribals - individual immunity wins) / (Tribal Council voting appearances - individual immunity wins).';
COMMENT ON COLUMN survivor_stats.votes_voided_by_idols IS 'VVp: Votes against the player voided by idol plays.';
COMMENT ON COLUMN survivor_stats.intended_votes_against_player IS 'VAPi: Votes against player + votes voided by idols.';
COMMENT ON COLUMN survivor_stats.jury_votes_received IS 'JVF: Jury votes received to win.';
COMMENT ON COLUMN survivor_stats.total_jury_votes IS 'TotJ: Jurors who cast a vote at Final Tribal Council.';
COMMENT ON COLUMN survivor_stats.jury_vote_percent IS 'JV%: Jury votes received / total jury votes.';
COMMENT ON COLUMN survivor_stats.days_played IS 'Days: Days played until elimination.';
COMMENT ON COLUMN survivor_stats.finish_position IS 'Finish: Final placement, starting at 1 for the winner. Edge of Extinction generally uses elimination order, adjusted for early Edge departures; Redemption Island uses departure order while active.';
COMMENT ON COLUMN survivor_stats.times_played IS 'Time: Ordinal season played by the player: 1 for their first, 2 for their second, and so on.';
COMMENT ON COLUMN survivor_stats.exile_days_played IS 'Exile: Days technically in-game but outside the regular game, including Exile, Redemption, Ghost Island, or Edge of Extinction.';

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
