import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";
import { execFileSync } from "node:child_process";

const lines = readFileSync("survivor-stats.tsv", "utf8").trimEnd().split(/\r?\n/);
const headers = lines.shift().split("\t");
headers[53] = "unused_blank_column";
const rows = lines.map((line, index) => {
  const cells = line.split("\t");
  if (cells.length !== headers.length) throw new Error(`Row ${index + 2}: wrong column count`);
  return Object.fromEntries(headers.map((header, i) => [header, cells[i] === "" ? null : cells[i]]));
});
const sql = readFileSync(new URL("./import-survivor-stats.sql", import.meta.url), "utf8")
  .replace(/^\\set.*$/m, "");
const [setup, finish] = sql.split(/^\\copy.*$/m);
if (!finish) throw new Error("Missing staging import instruction");
const connectionString = process.argv.includes("--heroku")
  ? execFileSync("heroku", ["config:get", "DATABASE_URL", "--app", "survivor-hham"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  : process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString,
  ssl: (connectionString ?? "").includes("localhost") ? undefined : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
let client;
try {
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("LOCK TABLE survivor_stats IN EXCLUSIVE MODE");
  const before = await client.query("SELECT count(*)::int AS count FROM survivor_stats");
  if (before.rows[0].count !== 0) throw new Error("survivor_stats is not empty; import stopped to avoid duplicate rows");
  await client.query(setup.replace(/\bBEGIN;/, ""));
  const columns = headers.map((h) => '"' + h.replaceAll('"', '""') + '"').join(", ");
  await client.query(`INSERT INTO survivor_stats_source (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::survivor_stats_source, $1::jsonb)`, [JSON.stringify(rows)]);
  await client.query(finish.replace(/COMMIT;\s*$/, ""));
  const result = await client.query("SELECT count(*)::int AS rows, min(season_number) AS first_season, max(season_number) AS last_season FROM survivor_stats");
  if (result.rows[0].rows !== rows.length) throw new Error("Imported row count differs from source");
  const seasons = await client.query("SELECT season_number, count(*)::int AS rows FROM survivor_stats GROUP BY season_number ORDER BY season_number");
  await client.query("COMMIT");
  console.log(JSON.stringify({ imported: result.rows[0], seasons: seasons.rows }));
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  console.error(`Import failed: ${error.message || error.code || error.constructor.name}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
