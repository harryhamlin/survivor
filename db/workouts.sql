-- Exercises and workouts are created by their owners in the application.
CREATE TABLE IF NOT EXISTS training_exercises (
  id text PRIMARY KEY,
  author_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name text NOT NULL CHECK (btrim(author_name) <> ''),
  name text NOT NULL,
  focus text NOT NULL CHECK (focus IN ('Push', 'Pull', 'Legs', 'Core', 'PT', 'Cardio')),
  goals text[] NOT NULL CHECK (
    cardinality(goals) BETWEEN 1 AND 4 AND goals <@ ARRAY['Power', 'Strength', 'Endurance', 'Cardiovascular']
  ),
  muscle_groups text[] NOT NULL CHECK (
    cardinality(muscle_groups) > 0 AND muscle_groups <@ ARRAY[
      'Chest', 'Shoulders', 'Triceps', 'Biceps', 'Forearms', 'Lats', 'Upper back',
      'Lower back', 'Abs', 'Obliques', 'Glutes', 'Quads', 'Hamstrings', 'Calves',
      'Hip flexors', 'Adductors', 'Abductors'
    ]
  ),
  unit text NOT NULL CHECK (unit IN ('reps', 'seconds', 'minutes'))
);

CREATE TABLE IF NOT EXISTS training_workouts (
  id text PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  focus text NOT NULL CHECK (focus IN ('Push', 'Pull', 'Legs', 'Core', 'PT', 'Cardio')),
  goals text[] NOT NULL CHECK (
    cardinality(goals) BETWEEN 1 AND 4 AND goals <@ ARRAY['Power', 'Strength', 'Endurance', 'Cardiovascular']
  ),
  muscle_groups text[] NOT NULL CHECK (
    cardinality(muscle_groups) > 0 AND muscle_groups <@ ARRAY[
      'Chest', 'Shoulders', 'Triceps', 'Biceps', 'Forearms', 'Lats', 'Upper back',
      'Lower back', 'Abs', 'Obliques', 'Glutes', 'Quads', 'Hamstrings', 'Calves',
      'Hip flexors', 'Adductors', 'Abductors'
    ]
  ),
  minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 600),
  description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS training_workout_exercises (
  workout_id text NOT NULL REFERENCES training_workouts(id) ON DELETE CASCADE,
  position integer NOT NULL,
  exercise_id text NOT NULL REFERENCES training_exercises(id),
  sets integer NOT NULL CHECK (sets BETWEEN 1 AND 8),
  target integer NOT NULL CHECK (target BETWEEN 1 AND 3600),
  PRIMARY KEY (workout_id, position)
);

-- Capture the performed sets with their names and units so history is a record of that day.
CREATE TABLE IF NOT EXISTS training_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL,
  workout_name text NOT NULL,
  performed_on date NOT NULL,
  notes text NOT NULL,
  movements jsonb NOT NULL,
  UNIQUE (user_id, submission_id)
);
CREATE INDEX IF NOT EXISTS training_sessions_user_date ON training_sessions (user_id, performed_on DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS training_exercises_author_exercise ON training_exercises (author_id, id);
CREATE INDEX IF NOT EXISTS training_workouts_owner ON training_workouts (owner_id);

-- A repeating ISO weekday schedule. The composite FK keeps each exercise in its creator's plan.
CREATE TABLE IF NOT EXISTS training_weekly_plan (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  exercise_id text NOT NULL,
  position smallint NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, day_of_week, exercise_id),
  FOREIGN KEY (user_id, exercise_id) REFERENCES training_exercises (author_id, id) ON DELETE CASCADE
);

-- What each weekday is for. Written by the weekly plan generator; days without a row are unassigned.
CREATE TABLE IF NOT EXISTS training_weekly_days (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  kind text NOT NULL CHECK (kind IN ('Strength', 'Endurance', 'Rest')),
  PRIMARY KEY (user_id, day_of_week)
);

-- Before pin tracking, a weekday without a generated day type had only manual entries.
ALTER TABLE training_weekly_plan ADD COLUMN IF NOT EXISTS pinned boolean;
UPDATE training_weekly_plan p SET pinned = NOT EXISTS (
  SELECT 1 FROM training_weekly_days d WHERE d.user_id = p.user_id AND d.day_of_week = p.day_of_week
) WHERE p.pinned IS NULL;
ALTER TABLE training_weekly_plan ALTER COLUMN pinned SET DEFAULT false, ALTER COLUMN pinned SET NOT NULL;

-- Starter exercise library for the owner's account. Fixed ids make this a no-op on later deploys.
INSERT INTO training_exercises (id, author_id, author_name, name, focus, goals, muscle_groups, unit)
SELECT x.id, u.id, COALESCE(NULLIF(btrim(u.name), ''), 'Member ' || u.id), x.name, x.focus, x.goals, x.muscle_groups, x.unit
FROM users u
CROSS JOIN (VALUES
  ('lib-lunges', 'Lunges', 'Legs', ARRAY['Strength', 'Endurance'], ARRAY['Quads', 'Glutes', 'Hamstrings'], 'reps'),
  ('lib-bulgarian-split-squats', 'Bulgarian split squats', 'Legs', ARRAY['Strength', 'Endurance'], ARRAY['Quads', 'Glutes', 'Hamstrings', 'Adductors'], 'reps'),
  ('lib-hip-thrusts', 'Hip thrusts', 'Legs', ARRAY['Strength', 'Power'], ARRAY['Glutes', 'Hamstrings'], 'reps'),
  ('lib-pendulum-squats', 'Pendulum squats', 'Legs', ARRAY['Strength'], ARRAY['Quads', 'Glutes'], 'reps'),
  ('lib-cable-back-extensions', 'Cable back extensions', 'Core', ARRAY['Strength', 'Endurance'], ARRAY['Lower back', 'Glutes', 'Hamstrings'], 'reps'),
  ('lib-pull-ups', 'Pull-ups', 'Pull', ARRAY['Strength', 'Endurance'], ARRAY['Lats', 'Upper back', 'Biceps', 'Forearms'], 'reps'),
  ('lib-dips', 'Dips', 'Push', ARRAY['Strength', 'Endurance'], ARRAY['Chest', 'Triceps', 'Shoulders'], 'reps'),
  ('lib-overhead-barbell-press', 'Overhead barbell press', 'Push', ARRAY['Strength', 'Power'], ARRAY['Shoulders', 'Triceps', 'Upper back'], 'reps'),
  ('lib-standing-biceps-curls', 'Standing biceps curls', 'Pull', ARRAY['Strength'], ARRAY['Biceps', 'Forearms'], 'reps'),
  ('lib-preacher-dumbbell-curls', 'Preacher dumbbell curls', 'Pull', ARRAY['Strength'], ARRAY['Biceps'], 'reps'),
  ('lib-preacher-ez-bar-curls', 'Preacher EZ bar curls', 'Pull', ARRAY['Strength'], ARRAY['Biceps', 'Forearms'], 'reps'),
  ('lib-bayesian-cable-curls', 'Bayesian cable curls', 'Pull', ARRAY['Strength', 'Endurance'], ARRAY['Biceps'], 'reps'),
  ('lib-incline-dumbbell-curls', 'Incline dumbbell curls', 'Pull', ARRAY['Strength'], ARRAY['Biceps'], 'reps'),
  ('lib-seated-dumbbell-curls', 'Seated dumbbell curls', 'Pull', ARRAY['Strength'], ARRAY['Biceps', 'Forearms'], 'reps'),
  ('lib-reverse-grip-ez-bar-curls', 'Reverse grip EZ bar curls', 'Pull', ARRAY['Strength'], ARRAY['Forearms', 'Biceps'], 'reps'),
  ('lib-katana-triceps-extensions', 'Katana triceps extensions', 'Push', ARRAY['Strength', 'Endurance'], ARRAY['Triceps'], 'reps'),
  ('lib-triceps-pushdown-overhead-complex', 'Triceps pushdown / overhead extension complex', 'Push', ARRAY['Strength', 'Endurance'], ARRAY['Triceps'], 'reps'),
  ('lib-standing-ez-bar-triceps-extensions', 'Standing EZ bar triceps extensions', 'Push', ARRAY['Strength'], ARRAY['Triceps'], 'reps'),
  ('lib-ez-bar-triceps-extensions', 'EZ bar triceps extensions', 'Push', ARRAY['Strength'], ARRAY['Triceps'], 'reps'),
  ('lib-dumbbell-triceps-extensions', 'Dumbbell triceps extensions', 'Push', ARRAY['Strength'], ARRAY['Triceps'], 'reps'),
  ('lib-incline-dumbbell-press', 'Incline dumbbell press', 'Push', ARRAY['Strength'], ARRAY['Chest', 'Shoulders', 'Triceps'], 'reps'),
  ('lib-machine-chest-press', 'Machine chest press', 'Push', ARRAY['Strength', 'Endurance'], ARRAY['Chest', 'Shoulders', 'Triceps'], 'reps'),
  ('lib-chest-supported-rows', 'Chest-supported rows', 'Pull', ARRAY['Strength'], ARRAY['Upper back', 'Lats', 'Biceps'], 'reps'),
  ('lib-lateral-cable-raises', 'Lateral cable raises', 'Push', ARRAY['Strength', 'Endurance'], ARRAY['Shoulders'], 'reps'),
  ('lib-lateral-dumbbell-raises', 'Lateral dumbbell raises', 'Push', ARRAY['Strength', 'Endurance'], ARRAY['Shoulders'], 'reps'),
  ('lib-hip-abductors', 'Hip abductors', 'Legs', ARRAY['Strength', 'Endurance'], ARRAY['Abductors', 'Glutes'], 'reps'),
  ('lib-pec-deck', 'Pec deck', 'Push', ARRAY['Strength', 'Endurance'], ARRAY['Chest', 'Shoulders'], 'reps'),
  ('lib-single-arm-low-to-high-cable-fly', 'Single-arm low-to-high cable fly', 'Push', ARRAY['Strength', 'Endurance'], ARRAY['Chest', 'Shoulders'], 'reps'),
  ('lib-ghd-sit-ups', 'GHD sit-ups', 'Core', ARRAY['Strength', 'Endurance'], ARRAY['Abs', 'Hip flexors'], 'reps'),
  ('lib-ab-rollouts', 'Ab rollouts', 'Core', ARRAY['Strength'], ARRAY['Abs', 'Obliques', 'Lats'], 'reps'),
  ('lib-toes-to-bar', 'Toes to bar', 'Core', ARRAY['Strength', 'Endurance'], ARRAY['Abs', 'Hip flexors', 'Lats', 'Forearms'], 'reps'),
  ('lib-chest-to-bar-pull-ups', 'Chest-to-bar pull-ups', 'Pull', ARRAY['Power', 'Strength', 'Endurance'], ARRAY['Lats', 'Upper back', 'Biceps', 'Forearms'], 'reps'),
  ('lib-box-jumps', 'Box jumps', 'Legs', ARRAY['Power'], ARRAY['Quads', 'Glutes', 'Calves'], 'reps'),
  ('lib-broad-jumps', 'Broad jumps', 'Legs', ARRAY['Power'], ARRAY['Glutes', 'Quads', 'Hamstrings', 'Calves'], 'reps'),
  ('lib-medicine-ball-throws', 'Medicine ball throws', 'Core', ARRAY['Power'], ARRAY['Abs', 'Obliques', 'Shoulders'], 'reps'),
  ('lib-sled-push', 'Sled push', 'Legs', ARRAY['Power', 'Strength', 'Endurance', 'Cardiovascular'], ARRAY['Quads', 'Glutes', 'Calves'], 'seconds'),
  ('lib-one-arm-ring-rows', 'One-arm ring rows', 'Pull', ARRAY['Strength', 'Endurance'], ARRAY['Upper back', 'Lats', 'Biceps', 'Obliques'], 'reps'),
  ('lib-smith-machine-barbell-press', 'Smith machine barbell press', 'Push', ARRAY['Strength'], ARRAY['Chest', 'Shoulders', 'Triceps'], 'reps'),
  ('lib-barbell-power-cleans', 'Barbell power cleans', 'Legs', ARRAY['Power'], ARRAY['Quads', 'Glutes', 'Hamstrings', 'Upper back', 'Calves'], 'reps'),
  ('lib-leg-extensions', 'Leg extensions', 'Legs', ARRAY['Strength', 'Endurance'], ARRAY['Quads'], 'reps'),
  ('lib-lat-pulldowns', 'Lat pulldowns', 'Pull', ARRAY['Strength'], ARRAY['Lats', 'Upper back', 'Biceps'], 'reps'),
  ('lib-cable-reverse-fly', 'Cable reverse fly', 'Pull', ARRAY['Strength', 'Endurance'], ARRAY['Upper back', 'Lats', 'Shoulders'], 'reps'),
  ('lib-cable-rows', 'Cable rows', 'Pull', ARRAY['Strength'], ARRAY['Upper back', 'Lats', 'Biceps'], 'reps'),
  ('lib-single-arm-cable-pulldowns', 'Single-arm cable pulldowns', 'Pull', ARRAY['Strength', 'Endurance'], ARRAY['Lats', 'Biceps'], 'reps'),
  ('lib-biking', 'Biking', 'Cardio', ARRAY['Endurance', 'Cardiovascular'], ARRAY['Quads', 'Hamstrings', 'Glutes', 'Calves'], 'minutes'),
  ('lib-banded-lateral-walks', 'Banded lateral walks', 'PT', ARRAY['Endurance'], ARRAY['Abductors', 'Glutes'], 'reps'),
  ('lib-clamshells', 'Clamshells', 'PT', ARRAY['Endurance'], ARRAY['Abductors', 'Glutes'], 'reps'),
  ('lib-box-step-downs', 'Box step-downs', 'PT', ARRAY['Strength', 'Endurance'], ARRAY['Quads', 'Glutes'], 'reps')
) AS x(id, name, focus, goals, muscle_groups, unit)
WHERE lower(u.email) = 'harryhamlin@gmail.com'
ON CONFLICT (id) DO NOTHING;
