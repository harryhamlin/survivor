import { Form, Link, redirect, useNavigation } from "react-router";
import { authenticate } from "../login.server";
import { getUserId } from "../session.server";
import type { Route } from "./+types/training-login";
import { trainingPath } from "../training/model";
import { FormMessage, PageTitle } from "../training/ui";

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
  const busy = useNavigation().state !== "idle";
  return <div className="tr-narrow"><PageTitle title="Sign in"/>
    <p className="tr-intro">Use your Torchsnuffers account to save workouts and log your training.</p>
    <Form method="post" action={"?next=" + encodeURIComponent(loaderData.next)} className="tr-form">
      <label>Email<input type="email" name="email" autoComplete="email" required/></label>
      <label>Password<input type="password" name="password" autoComplete="current-password" required/></label>
      <FormMessage error={actionData?.error}/><button type="submit" className="tr-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <Link to="/forgot-password" className="tr-text-link">Forgot password?</Link>
    </Form></div>;
}
