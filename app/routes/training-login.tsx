import { redirect } from "react-router";
import { authenticate } from "../login.server";
import { getUserId } from "../session.server";
import type { Route } from "./+types/training-login";
import { trainingPath } from "../training/model";
import { LoginForm } from "../components/LoginForm";

export const meta = () => [{ title: "Sign in | Torchsnuffers Training" }];
function destination(request: Request) {
  const next = new URL(request.url).searchParams.get("next");
  return next && /^\/workouts(?:\/[a-z0-9-]+)*$/.test(next) && next !== trainingPath + "/sign-in" ? next : trainingPath;
}
export async function loader({ request }: Route.LoaderArgs) {
  if (await getUserId(request) !== null) throw redirect(destination(request));
  return { next: destination(request) };
}
export function action({ request }: Route.ActionArgs) {
  return authenticate(request, destination(request));
}
export default function TrainingLogin({ actionData, loaderData }: Route.ComponentProps) {
  return <LoginForm
    title="Workout tracker"
    home={trainingPath}
    action={"?next=" + encodeURIComponent(loaderData.next)}
    error={actionData?.error}
  />;
}
