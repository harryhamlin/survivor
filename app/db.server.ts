// Shared Postgres connection pool for all server-side code (loaders/actions).
// Imported anywhere a route needs to run a SQL query against the app's database.
import "dotenv/config";
import { Pool } from "pg";

// Heroku Postgres (and most managed Postgres providers) require SSL, but a
// local `psql` install on localhost has no TLS cert configured at all.
// Detecting "localhost" in the connection string lets the same code work in
// both environments without relying on NODE_ENV, which Heroku doesn't
// reliably set for the running dyno process.
const isLocal = (process.env.DATABASE_URL ?? "").includes("localhost");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // `rejectUnauthorized: false` accepts Heroku's self-signed cert chain.
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

export default pool;
