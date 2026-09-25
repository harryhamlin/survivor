import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

const isLocal = (process.env.DATABASE_URL ?? "").includes("localhost");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const users = [{ username: "test", password: "test" }];

for (const { username, password } of users) {
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, passwordHash],
  );
  console.log(`Seeded user: ${username}`);
}

await pool.end();
