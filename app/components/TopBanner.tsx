// Full-width banner shown at the top of every authenticated page: the
// logged-in user's name on the left, links to the other authenticated pages
// plus logout on the right. Meant to span the entire viewport width, so
// route components render it *outside* their narrower centered content
// column, not inside it.
import { Form, Link } from "react-router";

// Every page this banner can appear on, and the nav link that goes to it.
// Listed once here (rather than a hardcoded ternary) so adding a page just
// means adding a row.
const NAV_LINKS = [
  { page: "dashboard", to: "/dashboard", label: "dashboard" },
  { page: "leaderboard", to: "/leaderboard", label: "leaderboard" },
  { page: "season-results", to: "/season-results", label: "game_results" },
  { page: "account", to: "/account", label: "account" },
] as const;

export function TopBanner({
  displayName,
  page,
}: {
  // The account's name — or, for a legacy/seeded account with no name set,
  // whatever the caller falls back to (e.g. their email).
  displayName: string;
  // Which page is currently showing this banner — that page's own nav link
  // is left out, so it never just links to the page you're already on.
  page: (typeof NAV_LINKS)[number]["page"];
}) {
  return (
    <div className="flex w-full items-center justify-between border-b border-primary/40 px-4 py-4">
      <p className="text-lg font-semibold text-primary">{displayName}</p>
      <div className="flex items-center gap-4">
        {NAV_LINKS.filter((link) => link.page !== page).map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="text-sm text-primary/70 hover:underline"
          >
            {link.label}
          </Link>
        ))}
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
