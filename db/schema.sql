CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contestants (
  id SERIAL PRIMARY KEY,
  contestant_name TEXT UNIQUE NOT NULL
);

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

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  contestant_id INTEGER NOT NULL REFERENCES contestants(id),
  PRIMARY KEY (team_id, contestant_id)
);