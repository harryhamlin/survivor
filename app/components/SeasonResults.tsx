// Presentational component for the "/season-results" page — the actual
// in-show record, one block per episode. Pure markup; all the data comes
// from the route's loader.
import { TopBanner } from "./TopBanner";

type Episode = {
  episodeNumber: number;
  airDate: Date | null;
  finalized: boolean;
  eliminated: string[];
  immunityWinners: string[];
};

// A SQL DATE has no time-of-day or timezone of its own, but `pg` still
// hands it back as a Date object representing UTC midnight on that day —
// formatting with `timeZone: "UTC"` is what keeps that from rendering a day
// early in a timezone behind UTC.
function formatAirDate(airDate: Date): string {
  return airDate.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function SeasonResults({
  displayName,
  episodes,
}: {
  displayName: string;
  episodes: Episode[];
}) {
  return (
    <main className="min-h-screen bg-background">
      <TopBanner displayName={displayName} page="season-results" />
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
        <h1 className="text-2xl font-semibold text-primary">
          game_results
        </h1>

        {episodes.length === 0 ? (
          <p className="text-primary/70">No episodes yet.</p>
        ) : (
          <ul className="space-y-4">
            {episodes.map((episode) => (
              <li
                key={episode.episodeNumber}
                className="space-y-1 border border-primary/40 p-4"
              >
                <p className="font-medium text-primary">
                  Episode {episode.episodeNumber}
                  {episode.airDate && (
                    <span className="text-primary/70">
                      {" "}
                      — {formatAirDate(episode.airDate)}
                    </span>
                  )}
                </p>
                {episode.finalized ? (
                  <div className="text-sm text-primary/80">
                    <p>
                      Voted out:{" "}
                      {episode.eliminated.length > 0
                        ? episode.eliminated.join(", ")
                        : "no one"}
                    </p>
                    <p>
                      Immunity:{" "}
                      {episode.immunityWinners.length > 0
                        ? episode.immunityWinners.join(", ")
                        : "not recorded"}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-primary/70">
                    Results aren&apos;t in yet.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
