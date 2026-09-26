import type { Route } from "./+types/report-bug";
import pool from "../db.server";
import { getUserId } from "../session.server";
import { limitRequest } from "../rateLimit.server";
import { readFormData } from "../security.server";

const MAX_REPORT_LENGTH = 2000;
// Generous enough for genuine back-to-back reports, tight enough to blunt a
// script hammering this public endpoint.
const RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function action({ request }: Route.ActionArgs) {
  await limitRequest(request, "report-bug", RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  const userId = await getUserId(request);
  const formData = await readFormData(request);
  const report = String(formData.get("report") ?? "").trim();

  if (!report) {
    return { error: "Please describe the issue" };
  }
  if (report.length > MAX_REPORT_LENGTH) {
    return { error: `Please keep it under ${MAX_REPORT_LENGTH} characters` };
  }

  await pool.query("INSERT INTO bug_reports (user_id, report) VALUES ($1, $2)", [
    userId,
    report,
  ]);

  return { success: true };
}
