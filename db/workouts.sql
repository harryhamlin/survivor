-- Exercises and workouts are created by their owners in the application.
CREATE TABLE IF NOT EXISTS training_exercises (
  id text PRIMARY KEY,
  author_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name text NOT NULL CHECK (btrim(author_name) <> ''),
  name text NOT NULL,
  focus text NOT NULL CHECK (focus IN ('Push', 'Pull', 'Legs', 'Core','Butt')),
  goals text[] NOT NULL CHECK (
    cardinality(goals) BETWEEN 1 AND 3 AND goals <@ ARRAY['Power', 'Strength', 'Endurance']
  ),
  muscle_groups text[] NOT NULL CHECK (
    cardinality(muscle_groups) > 0 AND muscle_groups <@ ARRAY[
      'Chest', 'Shoulders', 'Triceps', 'Biceps', 'Forearms', 'Lats', 'Upper back',
      'Lower back', 'Abs', 'Obliques', 'Glutes', 'Quads', 'Hamstrings', 'Calves',
      'Hip flexors', 'Adductors', 'Abductors'
    ]
  ),
  unit text NOT NULL CHECK (unit IN ('reps', 'seconds'))
);

CREATE TABLE IF NOT EXISTS training_workouts (
  id text PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  focus text NOT NULL CHECK (focus IN ('Push', 'Pull', 'Legs', 'Core','Butt')),
  goals text[] NOT NULL CHECK (
    cardinality(goals) BETWEEN 1 AND 3 AND goals <@ ARRAY['Power', 'Strength', 'Endurance']
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
  PRIMARY KEY (user_id, day_of_week, exercise_id),
  FOREIGN KEY (user_id, exercise_id) REFERENCES training_exercises (author_id, id) ON DELETE CASCADE
);
