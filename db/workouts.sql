-- Shared starter entries have no owner. Personal entries use the existing Torchsnuffers user ID.
CREATE TABLE IF NOT EXISTS training_exercises (
  id text PRIMARY KEY,
  owner_id integer REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  focus text NOT NULL,
  equipment text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('reps', 'seconds')),
  cue text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS training_workouts (
  id text PRIMARY KEY,
  owner_id integer REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  focus text NOT NULL,
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
CREATE INDEX IF NOT EXISTS training_exercises_owner ON training_exercises (owner_id);
CREATE INDEX IF NOT EXISTS training_workouts_owner ON training_workouts (owner_id);

INSERT INTO training_exercises (id, name, focus, equipment, unit, cue) VALUES
  ('goblet-squat','Goblet squat','Lower body','Dumbbell','reps','Hold one dumbbell at your chest and squat with both feet planted.'),
  ('floor-press','Dumbbell floor press','Upper body','Dumbbell','reps','Lie on the floor and press the dumbbells up from bent elbows.'),
  ('single-arm-row','Single-arm row','Upper body','Dumbbell','reps','Brace one hand on a bench and draw the weight toward your hip. Count reps per side.'),
  ('plank','Forearm plank','Core','Bodyweight','seconds','Rest on your forearms and toes and hold a straight line from shoulders to heels.'),
  ('rdl','Romanian deadlift','Lower body','Barbell','reps','Keep the bar close to your legs as you hinge at the hips and stand again.'),
  ('reverse-lunge','Reverse lunge','Lower body','Dumbbell','reps','Step one foot back, bend both knees and return to standing. Count reps per side.'),
  ('glute-bridge','Glute bridge','Lower body','Bodyweight','reps','Lie on your back with feet planted and lift your hips.'),
  ('calf-raise','Standing calf raise','Lower body','Bodyweight','reps','Stand tall, rise onto your toes and lower your heels with control.'),
  ('push-up','Push-up','Upper body','Bodyweight','reps','Place your hands just outside shoulder width and press away from the floor.'),
  ('overhead-press','Dumbbell overhead press','Upper body','Dumbbell','reps','Start with the dumbbells at shoulder height and press overhead.'),
  ('band-row','Resistance band row','Upper body','Resistance band','reps','Pull the band toward your ribs with your elbows close to your sides.'),
  ('dead-bug','Dead bug','Core','Bodyweight','reps','Lie on your back and extend the opposite arm and leg. Count reps per side.'),
  ('side-plank','Side plank','Core','Bodyweight','seconds','Hold a straight line supported on one forearm. Repeat the hold on each side.'),
  ('mountain-climber','Mountain climber','Full body','Bodyweight','seconds','From a high plank, alternate drawing each knee toward your chest.'),
  ('air-squat','Bodyweight squat','Lower body','Bodyweight','reps','Bend at the hips and knees, then stand tall.'),
  ('jump-rope','Jump rope','Full body','Jump rope','seconds','Turn the rope from your wrists and keep the jumps small.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO training_workouts (id, name, focus, minutes, description) VALUES
  ('full-body-foundation','Full body foundation','Full body',35,'A squat, a press, a pull and a hold. Four staple movements for a full body strength session.'),
  ('lower-body-strength','Lower body strength','Lower body',40,'Work through a hinge, a lunge and two accessories for the legs.'),
  ('upper-body-push-pull','Upper body push & pull','Upper body',30,'Pair horizontal and overhead presses with two rowing movements.'),
  ('core-stability','Core stability','Core',15,'Three floor-based movements for a short core session.'),
  ('bodyweight-circuit','Bodyweight circuit','Full body',20,'Move through squats, push-ups, mountain climbers and a plank.'),
  ('rope-and-core','Rope & core','Full body',20,'Combine jump rope intervals with floor work.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO training_workout_exercises (workout_id, position, exercise_id, sets, target) VALUES
  ('full-body-foundation',1,'goblet-squat',3,10), ('full-body-foundation',2,'floor-press',3,10),
  ('full-body-foundation',3,'single-arm-row',3,12), ('full-body-foundation',4,'plank',3,30),
  ('lower-body-strength',1,'rdl',3,8), ('lower-body-strength',2,'reverse-lunge',3,10),
  ('lower-body-strength',3,'glute-bridge',3,12), ('lower-body-strength',4,'calf-raise',3,15),
  ('upper-body-push-pull',1,'floor-press',3,10), ('upper-body-push-pull',2,'single-arm-row',3,12),
  ('upper-body-push-pull',3,'overhead-press',3,8), ('upper-body-push-pull',4,'band-row',3,12),
  ('core-stability',1,'dead-bug',3,10), ('core-stability',2,'side-plank',3,20), ('core-stability',3,'plank',3,30),
  ('bodyweight-circuit',1,'air-squat',3,12), ('bodyweight-circuit',2,'push-up',3,8),
  ('bodyweight-circuit',3,'mountain-climber',3,30), ('bodyweight-circuit',4,'plank',3,30),
  ('rope-and-core',1,'jump-rope',4,60), ('rope-and-core',2,'dead-bug',3,10), ('rope-and-core',3,'side-plank',3,20)
ON CONFLICT (workout_id, position) DO NOTHING;
