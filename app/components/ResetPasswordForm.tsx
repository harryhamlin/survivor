// Presentational component for the "/reset-password/:token" page. `valid`
// is decided by the route's loader (re-checked by the action on submit,
// since a link can expire between the two) — pure markup either way.
import { Form, Link } from "react-router";

export function ResetPasswordForm({
  valid,
  error,
}: {
  valid: boolean;
  error?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-16">
        <h1
          className="font-heading whitespace-nowrap text-center tracking-wide text-primary"
          style={{ fontSize: "clamp(1.5rem, 7vw, 2.25rem)" }}
        >
          <Link to="/">
            Fantasy Survivor 51
          </Link>
        </h1>
        <div className="space-y-4">
          {valid ? (
            <>
              <p className="text-center text-sm text-primary/70">
                Choose a new password
              </p>
              <Form method="post" className="space-y-4">
                <div className="space-y-1">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-primary"
                  >
                    New password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="w-full border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {/* Set by the route's action if the reset failed — most
                    likely the link expired between page load and submit. */}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90"
                >
                  Reset password
                </button>
              </Form>
            </>
          ) : (
            <p className="text-center text-sm text-primary/70">
              This password reset link is invalid or has expired.{" "}
              <Link to="/forgot-password" className="underline">
                Request a new one
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
