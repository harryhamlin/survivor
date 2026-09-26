import { Form, Link } from "react-router";
import type { Route } from "./+types/confirm-email";
import { confirmEmail, getPendingEmail } from "../accountSecurity.server";
import { logout, requireUserId } from "../session.server";
import { limitRequest } from "../rateLimit.server";

export function meta() {
  return [{ title: "confirm email" }, { name: "referrer", content: "no-referrer" }];
}

export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  return { email: await getPendingEmail(userId, params.token) };
}

export async function action({ request, params }: Route.ActionArgs) {
  await limitRequest(request, "confirm-email", 10, 15 * 60_000);
  const userId = await requireUserId(request);
  if (!await confirmEmail(userId, params.token)) {
    return { error: "This link is invalid, expired, or the email is no longer available." };
  }
  return logout(request);
}

export default function ConfirmEmail({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-12 text-primary">
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Confirm your email</h1>
        {loaderData.email ? (
          <Form method="post" className="space-y-4">
            <p>Change your email to {loaderData.email}? You will be signed out on all devices and can sign in with your new email.</p>
            <button type="submit" className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black">Confirm email change</button>
          </Form>
        ) : <p>This link is invalid or expired. Sign in to the account that requested the change, then reopen the link.</p>}
        {actionData?.error && <p className="text-red-500">{actionData.error}</p>}
        <Link to="/account" className="underline">Back to account</Link>
      </div>
    </main>
  );
}
