// Two independent forms for the "/account" page — profile info (name,
// email) and change password — each posting to the same route with its own
// `intent`, tagged the same way so each only ever shows its own
// success/error message (mirrors the dashboard route's two-form pattern).
// Pure markup; the actual update logic lives in the route.
import { Form } from "react-router";

type ProfileResult = { intent: "update-profile"; error?: string; success?: boolean };
type PasswordResult = { intent: "change-password"; error?: string; success?: boolean };

export function AccountForm({
  user,
  actionData,
}: {
  user: { name: string | null; email: string };
  actionData: ProfileResult | PasswordResult | undefined;
}) {
  const profileResult =
    actionData?.intent === "update-profile" ? actionData : undefined;
  const passwordResult =
    actionData?.intent === "change-password" ? actionData : undefined;

  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-primary">Account info</h1>
        {/* Keyed on the loaded user so a successful save (which revalidates
            the loader) remounts the form with the new values as its
            defaults — otherwise these uncontrolled inputs would keep
            showing what was typed, not what actually got saved. */}
        <Form
          method="post"
          className="space-y-4"
          key={`${user.name}-${user.email}`}
        >
          <input type="hidden" name="intent" value="update-profile" />
          <div className="space-y-1">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-primary"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              defaultValue={user.name ?? ""}
              className="w-full border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-primary"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={user.email}
              className="w-full border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {/* Set by the route's action — success just as often as failure,
              since there's no redirect to signal it otherwise. */}
          {profileResult?.error && (
            <p className="text-sm text-red-500">{profileResult.error}</p>
          )}
          {profileResult?.success && (
            <p className="text-sm text-primary/70">Saved.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90"
          >
            Save
          </button>
        </Form>
      </div>

      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-primary">
          Change password
        </h1>
        {/* Keyed on whether the last change succeeded so the fields clear
            afterward instead of leaving the just-submitted values sitting
            in a password box. */}
        <Form
          method="post"
          className="space-y-4"
          key={passwordResult?.success ? "changed" : "unchanged"}
        >
          <input type="hidden" name="intent" value="change-password" />
          <div className="space-y-1">
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium text-primary"
            >
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="w-full border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-primary"
            >
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {passwordResult?.error && (
            <p className="text-sm text-red-500">{passwordResult.error}</p>
          )}
          {passwordResult?.success && (
            <p className="text-sm text-primary/70">Password changed.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90"
          >
            Change password
          </button>
        </Form>
      </div>
    </div>
  );
}
