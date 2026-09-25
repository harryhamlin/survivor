// Applies db/schema.sql to whatever database DATABASE_URL points at.
//
// Run manually for local setup (`npm run db:migrate`), and automatically by
// Heroku's release phase on every deploy (see Procfile) — that's what keeps
// a freshly-provisioned Heroku Postgres database from ending up with zero
// tables after a deploy.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

// Resolve schema.sql relative to this file (not the current working
// directory) so this works the same whether it's run from the repo root or
// anywhere else.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(__dirname, "schema.sql"), "utf8");

// Same local-vs-hosted SSL detection as app/db.server.ts — see the comment
// there for why this checks the URL instead of NODE_ENV.
const isLocal = (process.env.DATABASE_URL ?? "").includes("localhost");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

// `pg` sends a plain string like this over the simple query protocol, which
// (unlike the extended/prepared-statement protocol) supports a whole file's
// worth of semicolon-separated statements — including the DO $$ ... $$
// block — in a single call.
await pool.query(schema);
console.log("Schema applied");

await pool.end();
