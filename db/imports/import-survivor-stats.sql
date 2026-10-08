-- Run from the project root with psql; save the supplied data, including its
-- header and empty tab-separated cells, as survivor-stats.tsv first.
-- Imports source identity, demographics, and statistics without recalculation.
-- IDs are generated per row: PID repeats across seasons and cannot be the PK.
-- Blank cells and #DIV/0! become NULL; source metrics are not recalculated.
-- MPF is absent from the source and remains NULL.
-- This is a one-time INSERT, not an upsert. Re-running adds duplicate records.
-- Integer incompatibilities abort the entire transaction instead of rounding.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL DateStyle = 'ISO, MDY';
CREATE TEMP TABLE survivor_stats_source (
  "PID" TEXT,
  "Season" TEXT,
  "contestant" TEXT,
  "ChW" TEXT,
  "ChA" TEXT,
  "ChW%" TEXT,
  "SO" TEXT,
  "VFB" TEXT,
  "VAP" TEXT,
  "TotV" TEXT,
  "TCA" TEXT,
  "TC%" TEXT,
  "wTCR" TEXT,
  "VFT" TEXT,
  "JVF" TEXT,
  "TotJ" TEXT,
  "JV%" TEXT,
  "SurvSc" TEXT,
  "SurvAv" TEXT,
  "Days" TEXT,
  "Finish" TEXT,
  "Time" TEXT,
  "nonVFB" TEXT,
  "VFB%" TEXT,
  "nVFB%" TEXT,
  "NoJ" TEXT,
  "InRCA" TEXT,
  "InRCW" TEXT,
  "InICA" TEXT,
  "InICW" TEXT,
  "InChA" TEXT,
  "InChW" TEXT,
  "InChW%" TEXT,
  "TRCA" TEXT,
  "TRCW" TEXT,
  "TICA" TEXT,
  "TICW" TEXT,
  "TChA" TEXT,
  "TChW" TEXT,
  "TChW%" TEXT,
  "TrCh 2nd" TEXT,
  "TrCh 3rd" TEXT,
  "HCA" TEXT,
  "HCW" TEXT,
  "Exile" TEXT,
  "TVA" TEXT,
  "VAT%" TEXT,
  "NI VFT" TEXT,
  "NI VFT%" TEXT,
  "Sex" TEXT,
  "Birthday" TEXT,
  "Day 1 Filming date" TEXT,
  "Age" TEXT,
  "unused_blank_column" TEXT,
  "VVp" TEXT,
  "VAPi" TEXT
) ON COMMIT DROP;

\copy survivor_stats_source FROM 'survivor-stats.tsv' WITH (FORMAT csv, DELIMITER E'\t', HEADER true, NULL '', QUOTE E'\x01');

CREATE FUNCTION pg_temp.stat_number(value TEXT) RETURNS NUMERIC
LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE WHEN btrim(value) IN ('', '#DIV/0!') THEN NULL
              ELSE btrim(value)::NUMERIC END
$$;

-- Check the destination types before inserting, including fractional appearances
-- and wins in season 32 and half-days in seasons 27 and 29.
DO $$
DECLARE
  field RECORD;
  invalid_count BIGINT;
BEGIN
  FOR field IN
    SELECT a.attname AS destination, m.source
    FROM pg_attribute a
    JOIN (VALUES
      ('player_id', 'PID'),
      ('season_number', 'Season'),
      ('challenge_wins', 'ChW'),
      ('challenge_appearances', 'ChA'),
      ('challenge_win_percent', 'ChW%'),
      ('challenge_sit_outs', 'SO'),
      ('votes_for_eliminated_player', 'VFB'),
      ('votes_against_player', 'VAP'),
      ('total_tribal_votes', 'TotV'),
      ('tribal_council_voting_appearances', 'TCA'),
      ('tribal_council_success_percent', 'TC%'),
      ('weighted_tribal_council_ratio', 'wTCR'),
      ('vote_free_tribals', 'VFT'),
      ('jury_votes_received', 'JVF'),
      ('total_jury_votes', 'TotJ'),
      ('jury_vote_percent', 'JV%'),
      ('survival_score', 'SurvSc'),
      ('survival_average', 'SurvAv'),
      ('days_played', 'Days'),
      ('finish_position', 'Finish'),
      ('times_played', 'Time'),
      ('votes_not_for_eliminated_player', 'nonVFB'),
      ('vote_for_eliminated_player_percent', 'VFB%'),
      ('vote_not_for_eliminated_player_percent', 'nVFB%'),
      ('score_without_jury', 'NoJ'),
      ('individual_reward_appearances', 'InRCA'),
      ('individual_reward_wins', 'InRCW'),
      ('individual_immunity_appearances', 'InICA'),
      ('individual_immunity_wins', 'InICW'),
      ('individual_challenge_appearances', 'InChA'),
      ('individual_challenge_wins', 'InChW'),
      ('individual_challenge_win_percent', 'InChW%'),
      ('team_reward_appearances', 'TRCA'),
      ('team_reward_wins', 'TRCW'),
      ('team_immunity_appearances', 'TICA'),
      ('team_immunity_wins', 'TICW'),
      ('team_challenge_appearances', 'TChA'),
      ('team_challenge_wins', 'TChW'),
      ('team_challenge_win_percent', 'TChW%'),
      ('team_challenge_second_places', 'TrCh 2nd'),
      ('team_challenge_third_places', 'TrCh 3rd'),
      ('hero_challenge_appearances', 'HCA'),
      ('hero_challenge_wins', 'HCW'),
      ('exile_days_played', 'Exile'),
      ('tribals_with_votes_against', 'TVA'),
      ('tribals_with_votes_against_percent', 'VAT%'),
      ('non_immune_vote_free_tribals', 'NI VFT'),
      ('non_immune_vote_free_tribals_percent', 'NI VFT%'),
      ('votes_voided_by_idols', 'VVp'),
      ('intended_votes_against_player', 'VAPi')
    ) AS m(destination, source) ON m.destination = a.attname
    WHERE a.attrelid = 'survivor_stats'::regclass
      AND a.atttypid IN ('smallint'::regtype, 'integer'::regtype, 'bigint'::regtype)
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM survivor_stats_source WHERE pg_temp.stat_number(%1$I) <> trunc(pg_temp.stat_number(%1$I))',
      field.source
    ) INTO invalid_count;
    IF invalid_count > 0 THEN
      RAISE EXCEPTION '% -> %: % fractional values cannot be stored in the current integer column. No rows imported.',
        field.source, field.destination, invalid_count;
    END IF;
  END LOOP;
END $$;

INSERT INTO survivor_stats (
  player_id,
  season_number,
  contestant_name,
  sex,
  birth_date,
  filming_start_date,
  age_at_filming,
  challenge_wins,
  challenge_appearances,
  challenge_win_percent,
  challenge_sit_outs,
  votes_for_eliminated_player,
  votes_against_player,
  total_tribal_votes,
  tribal_council_voting_appearances,
  tribal_council_success_percent,
  weighted_tribal_council_ratio,
  vote_free_tribals,
  jury_votes_received,
  total_jury_votes,
  jury_vote_percent,
  survival_score,
  survival_average,
  days_played,
  finish_position,
  times_played,
  votes_not_for_eliminated_player,
  vote_for_eliminated_player_percent,
  vote_not_for_eliminated_player_percent,
  score_without_jury,
  individual_reward_appearances,
  individual_reward_wins,
  individual_immunity_appearances,
  individual_immunity_wins,
  individual_challenge_appearances,
  individual_challenge_wins,
  individual_challenge_win_percent,
  team_reward_appearances,
  team_reward_wins,
  team_immunity_appearances,
  team_immunity_wins,
  team_challenge_appearances,
  team_challenge_wins,
  team_challenge_win_percent,
  team_challenge_second_places,
  team_challenge_third_places,
  hero_challenge_appearances,
  hero_challenge_wins,
  exile_days_played,
  tribals_with_votes_against,
  tribals_with_votes_against_percent,
  non_immune_vote_free_tribals,
  non_immune_vote_free_tribals_percent,
  votes_voided_by_idols,
  intended_votes_against_player
)
SELECT
  pg_temp.stat_number("PID"),
  pg_temp.stat_number("Season"),
  NULLIF(btrim("contestant"), ''),
  NULLIF(btrim("Sex"), ''),
  NULLIF(NULLIF(btrim("Birthday"), ''), '#DIV/0!')::DATE,
  NULLIF(NULLIF(btrim("Day 1 Filming date"), ''), '#DIV/0!')::DATE,
  pg_temp.stat_number("Age"),
  pg_temp.stat_number("ChW"),
  pg_temp.stat_number("ChA"),
  pg_temp.stat_number("ChW%"),
  pg_temp.stat_number("SO"),
  pg_temp.stat_number("VFB"),
  pg_temp.stat_number("VAP"),
  pg_temp.stat_number("TotV"),
  pg_temp.stat_number("TCA"),
  pg_temp.stat_number("TC%"),
  pg_temp.stat_number("wTCR"),
  pg_temp.stat_number("VFT"),
  pg_temp.stat_number("JVF"),
  pg_temp.stat_number("TotJ"),
  pg_temp.stat_number("JV%"),
  pg_temp.stat_number("SurvSc"),
  pg_temp.stat_number("SurvAv"),
  pg_temp.stat_number("Days"),
  pg_temp.stat_number("Finish"),
  pg_temp.stat_number("Time"),
  pg_temp.stat_number("nonVFB"),
  pg_temp.stat_number("VFB%"),
  pg_temp.stat_number("nVFB%"),
  pg_temp.stat_number("NoJ"),
  pg_temp.stat_number("InRCA"),
  pg_temp.stat_number("InRCW"),
  pg_temp.stat_number("InICA"),
  pg_temp.stat_number("InICW"),
  pg_temp.stat_number("InChA"),
  pg_temp.stat_number("InChW"),
  pg_temp.stat_number("InChW%"),
  pg_temp.stat_number("TRCA"),
  pg_temp.stat_number("TRCW"),
  pg_temp.stat_number("TICA"),
  pg_temp.stat_number("TICW"),
  pg_temp.stat_number("TChA"),
  pg_temp.stat_number("TChW"),
  pg_temp.stat_number("TChW%"),
  pg_temp.stat_number("TrCh 2nd"),
  pg_temp.stat_number("TrCh 3rd"),
  pg_temp.stat_number("HCA"),
  pg_temp.stat_number("HCW"),
  pg_temp.stat_number("Exile"),
  pg_temp.stat_number("TVA"),
  pg_temp.stat_number("VAT%"),
  pg_temp.stat_number("NI VFT"),
  pg_temp.stat_number("NI VFT%"),
  pg_temp.stat_number("VVp"),
  pg_temp.stat_number("VAPi")
FROM survivor_stats_source;

COMMIT;
