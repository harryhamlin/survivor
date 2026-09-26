// Full-width banner shown at the top of every authenticated page: the
// logged-in user's name on the left, a hamburger menu (nav links plus
// logout) on the right. Meant to span the entire viewport width, so route
// components render it *outside* their narrower centered content column,
// not inside it.
import { useState } from "react";
import { Form, Link } from "react-router";

// Every page this banner can appear on, and the nav link that goes to it.
// Listed once here (rather than a hardcoded ternary) so adding a page just
// means adding a row.
const NAV_LINKS = [
  { page: "dashboard", to: "/dashboard", label: "dashboard" },
  { page: "leaderboard", to: "/leaderboard", label: "leaderboard" },
  { page: "season-results", to: "/season-results", label: "game_results" },
  { page: "contestants", to: "/contestants", label: "contestants" },
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative flex w-full items-center justify-between border-b border-primary/40 px-4 py-4">
      <p className="text-lg font-semibold text-primary">{displayName}</p>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="px-1 text-2xl leading-none text-primary/70 hover:text-primary"
        >
          ☰
        </button>

        {menuOpen && (
          <>
            {/* An invisible full-screen backdrop, below the menu panel but
                above everything else, so clicking anywhere outside the menu
                closes it — the menu panel itself stops the click from
                reaching this backdrop via stopPropagation. */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-48 space-y-1 border border-primary/40 bg-background p-2"
              onClick={(event) => event.stopPropagation()}
            >
              {NAV_LINKS.filter((link) => link.page !== page).map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-2 py-1 text-sm text-primary/70 hover:bg-primary/10 hover:text-primary"
                >
                  {link.label}
                </Link>
              ))}
              {/* Posting to /logout (a separate route) keeps "log out"
                  independent of whatever action the current page's own form
                  submits to. */}
              <Form method="post" action="/logout">
                <button
                  type="submit"
                  role="menuitem"
                  className="block w-full px-2 py-1 text-left text-sm text-primary/70 hover:bg-primary/10 hover:text-primary"
                >
                  Log out
                </button>
              </Form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
