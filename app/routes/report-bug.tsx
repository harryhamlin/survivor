import type { Route } from "./+types/report-bug";
import pool from "../db.server";
import { getUserId } from "../session.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  const formData = await request.formData();
  const report = String(formData.get("report") ?? "").trim();

  if (!report) {
    return { error: "Please describe the issue" };
  }

  await pool.query("INSERT INTO bug_reports (user_id, report) VALUES ($1, $2)", [
    userId,
    report,
  ]);

  return { success: true };
}
