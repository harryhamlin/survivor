// Seeds initial login accounts. Run manually (`npm run db:seed`) — this is
// separate from db/migrate.mjs (schema) and is not run automatically on
// deploy, so it won't keep resetting anyone's password on every release.
import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

// Same local-vs-hosted SSL detection as app/db.server.ts.
const isLocal = (process.env.DATABASE_URL ?? "").includes("localhost");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

// Accounts to ensure exist. Add more entries here for additional test users.
const users = [{ email: "test@example.com", name: "Test User", password: "test" }];

for (const { email, name, password } of users) {
  // Always hash — never store a plaintext password, even for a throwaway
  // test account.
  const passwordHash = await bcrypt.hash(password, 10);
  // Upsert: creates the user if it doesn't exist yet, or just refreshes the
  // password hash if it does, so this script is safe to run more than once.
  await pool.query(
    `INSERT INTO users (email, name, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, name, passwordHash],
  );
  console.log(`Seeded user: ${email}`);
}

await pool.end();
