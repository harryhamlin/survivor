// Presentational component for the "/forgot-password" page — pure markup.
// The actual lookup/email-sending logic lives in the route's `action`; this
// just renders the form, or a confirmation message once it's been
// submitted (see `sent` below).
import { Form, Link } from "react-router";

export function ForgotPasswordForm({ sent }: { sent: boolean }) {
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
          {sent ? (
            // Shown regardless of whether the entered email actually
            // matched an account — see the route's action for why phrasing
            // it this way (rather than "no account with that email") avoids
            // confirming who has signed up.
            <p className="text-center text-sm text-primary/70">
              If that email is on an account, a password reset link is on
              its way.
            </p>
          ) : (
            <>
              <p className="text-center text-sm text-primary/70">
                Reset your password
              </p>
              <Form method="post" className="space-y-4">
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
                    className="w-full border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90"
                >
                  Send reset link
                </button>
              </Form>
            </>
          )}
          <p className="text-center text-sm text-primary/70">
            <Link to="/login" className="underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
