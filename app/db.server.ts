import "dotenv/config";
import { Pool } from "pg";

const isLocal = (process.env.DATABASE_URL ?? "").includes("localhost");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

export default pool;
