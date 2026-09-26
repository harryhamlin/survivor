// The public landing page's content: everyone's cumulative score, plus a
// way to log in (or jump straight to the dashboard if already signed in).
// Pure markup — the data comes from the home route's loader.
import { Link } from "react-router";

export function Leaderboard({
  standings,
  isLoggedIn,
}: {
  standings: { playerId: number; name: string; score: number }[];
  isLoggedIn: boolean;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <h1
          className="font-heading whitespace-nowrap text-center tracking-wide text-primary"
          style={{ fontSize: "clamp(1.5rem, 7vw, 2.25rem)" }}
        >
          <Link to="/" className="hover:underline">
            Fantasy Survivor 51
          </Link>
        </h1>

        <div className="border border-primary/40">
          <div className="flex justify-between border-b border-primary/40 px-4 py-2 text-sm text-primary/70">
            <span>player</span>
            <span>score</span>
          </div>
          {standings.length > 0 ? (
            <ul>
              {standings.map((entry, index) => (
                <li
                  key={entry.playerId}
                  className="flex items-center justify-between border-b border-primary/20 px-4 py-3 last:border-b-0"
                >
                  <span className="text-primary">
                    <span className="mr-2 text-primary/50">{index + 1}.</span>
                    {entry.name}
                  </span>
                  <span className="font-medium text-primary">
                    {entry.score}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-primary/70">
              No players yet
            </p>
          )}
        </div>

        {isLoggedIn ? (
          <Link
            to="/dashboard"
            className="block w-full rounded-lg bg-primary px-4 py-3 text-center font-medium text-black hover:opacity-90"
          >
            go to dashboard
          </Link>
        ) : (
          <div className="space-y-3">
            <Link
              to="/login"
              className="block w-full rounded-lg bg-primary px-4 py-3 text-center font-medium text-black hover:opacity-90"
            >
              log in
            </Link>
            <p className="text-center text-sm text-primary/70">
              Need an account?{" "}
              <Link to="/signup" className="underline">
                sign up
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
