import type { Route } from "./+types/report-bug";
import pool from "../db.server";
import { getUserId } from "../session.server";
import { getClientIp, isRateLimited } from "../rateLimit.server";

const MAX_REPORT_LENGTH = 2000;
// Generous enough for genuine back-to-back reports, tight enough to blunt a
// script hammering this public endpoint.
const RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  const formData = await request.formData();
  const report = String(formData.get("report") ?? "").trim();

  if (!report) {
    return { error: "Please describe the issue" };
  }
  if (report.length > MAX_REPORT_LENGTH) {
    return { error: `Please keep it under ${MAX_REPORT_LENGTH} characters` };
  }

  const clientIp = getClientIp(request);
  if (isRateLimited(`report-bug:${clientIp}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return { error: "Too many reports — please try again later" };
  }

  await pool.query("INSERT INTO bug_reports (user_id, report) VALUES ($1, $2)", [
    userId,
    report,
  ]);

  return { success: true };
}
