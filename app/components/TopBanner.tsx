// Full-width banner shown at the top of every authenticated page: the
// logged-in user's name on the left, a link to the other authenticated page
// plus logout on the right. Meant to span the entire viewport width, so
// route components render it *outside* their narrower centered content
// column, not inside it.
import { Form, Link } from "react-router";

export function TopBanner({
  username,
  page,
}: {
  username: string;
  // Which page is currently showing this banner — determines whether the
  // secondary link points to "/leaderboard" or back to "/dashboard", so it
  // never just links to the page you're already on.
  page: "dashboard" | "leaderboard";
}) {
  return (
    <div className="flex w-full items-center justify-between border-b border-primary/40 px-4 py-4">
      <p className="text-lg font-semibold text-primary">{username}</p>
      <div className="flex items-center gap-4">
        {page === "dashboard" ? (
          <Link
            to="/leaderboard"
            className="text-sm text-primary/70 hover:underline"
          >
            leaderboard
          </Link>
        ) : (
          <Link
            to="/dashboard"
            className="text-sm text-primary/70 hover:underline"
          >
            dashboard
          </Link>
        )}
        {/* Posting to /logout (a separate route) keeps "log out" independent
            of whatever action the current page's own form submits to. */}
        <Form method="post" action="/logout">
          <button
            type="submit"
            className="text-sm text-primary/70 hover:underline"
          >
            Log out
          </button>
        </Form>
      </div>
    </div>
  );
}
