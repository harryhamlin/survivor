// Presentational component for the "/login" page — pure markup, no data
// fetching. All the actual login logic lives in the login route's `action`;
// this just renders the form and an optional error message.
import { Form, Link } from "react-router";

export function LoginForm({ error }: { error?: string }) {
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
          <Link to="/" className="hover:underline">
            Fantasy Survivor 51
          </Link>
        </h1>
        <div className="space-y-4">
          {/* No `action` prop needed: <Form> defaults to POSTing to this
              same route, which is exactly what we want. */}
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
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90"
            >
              Log in
            </button>
          </Form>
          <p className="text-center text-sm text-primary/70">
            Need an account?{" "}
            <Link to="/signup" className="underline">
              Sign up
            </Link>
          </p>
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
