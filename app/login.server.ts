import bcrypt from "bcryptjs";
import { data } from "react-router";
import { readFormData } from "./security.server";
import {
  accountKey,
  getClientIp,
  isRateLimited,
  limitRequest,
} from "./rateLimit.server";

import pool from "./db.server";
import { createUserSession } from "./session.server";

// Valid cost-10 dummy hash keeps nonexistent accounts on the bcrypt path.
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function authenticate(request: Request, destination: string) {
  await limitRequest(request, "login", 30, 15 * 60_000);
  const formData = await readFormData(request);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (await isRateLimited(`login:account:${accountKey(email)}`, 10, 15 * 60_000)) {
    console.error(
      `Login rate-limited for "${email}" from ${getClientIp(request)}`,
    );
    return data({ error: "Too many attempts. Please try again later." }, {
      status: 429, headers: { "Retry-After": "900" },
    });
  }

  const result = await pool.query(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email],
  );

  const user = result.rows[0] as
    | { id: number; password_hash: string }
    | undefined;
  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  if (!valid || !user) {
    console.error(
      `Login failed for "${email}" from ${getClientIp(request)}`,
    );
    return { error: "Invalid email or password" };
  }

  return createUserSession(user.id, destination, user.password_hash, email);
}
