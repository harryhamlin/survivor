import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const users = [
  {
    username: "test",
    password: "test",
    team: ["Aaliyah", "Rob", "Brady", "Patt", "Linnea"],
  },
];

for (const { username, password, team } of users) {
  const passwordHash = await bcrypt.hash(password, 10);
  const {
    rows: [user],
  } = await pool.query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [username, passwordHash],
  );
  console.log(`Seeded user: ${username}`);

  const {
    rows: [existingTeam],
  } = await pool.query("SELECT id FROM teams WHERE user_id = $1", [user.id]);

  if (!existingTeam && team) {
    const {
      rows: [newTeam],
    } = await pool.query(
      "INSERT INTO teams (user_id) VALUES ($1) RETURNING id",
      [user.id],
    );
    for (const contestantName of team) {
      await pool.query(
        `INSERT INTO team_members (team_id, contestant_id)
         SELECT $1, id FROM contestants WHERE contestant_name = $2`,
        [newTeam.id, contestantName],
      );
    }
    console.log(`Seeded team for ${username}: ${team.join(", ")}`);
  }
}

await pool.end();
