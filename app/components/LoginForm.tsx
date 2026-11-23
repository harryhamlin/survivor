// Presentational component for the "/login" page — pure markup, no data
// fetching. All the actual login logic lives in the login route's `action`;
// this just renders the form and an optional error message.
import { Form, Link, useNavigation } from "react-router";

export function LoginForm({
  error, title = "Fantasy Survivor 51", home = "/", action,
}: {
  error?: string;
  title?: string;
  home?: string;
  action?: string;
}) {
  const submitting = useNavigation().state === "submitting";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-16">
        {/* Site title, set in the custom "Son Of A Glitch" display font.
            `whitespace-nowrap` + a viewport-scaled font-size (via `clamp`)
            keep it on one line at any screen width instead of wrapping. */}
        <h1
          className="font-heading whitespace-nowrap text-center tracking-wide text-primary"
          style={{ fontSize: "clamp(1.5rem, 7vw, 2.25rem)" }}
        >
          <Link to={home}>{title}</Link>
        </h1>
        <div className="space-y-4">
          <Form method="post" action={action} className="space-y-4">
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
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-primary"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {/* Set by the route's action when the submitted credentials
                don't match a user in the database. */}
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary px-3 py-2 font-medium text-black hover:opacity-90"
            >
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </Form>
          <p className="text-center text-sm text-primary/70">
            <Link to="/forgot-password" className="underline">
              Forgot password?
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
