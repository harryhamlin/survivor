// Presentational component for the "/contestants" page — a photo grid of
// the season's cast, one frame per contestant. Pure markup; all the data
// comes from the route's loader.
import { TopBanner } from "./TopBanner";

type Contestant = {
  id: number;
  name: string;
  tribeColor: string | null;
  eliminated: boolean;
};

const ELIMINATED_COLOR = "#ff0000";
// Matches the app's usual neutral border-primary/40 look, for a contestant
// with no tribe assigned yet — plain inline CSS can't reference a Tailwind
// utility's resolved value directly, so this mirrors it with the same
// color-mix trick used for DetailedScores' sticky-column shadow.
const NO_TRIBE_COLOR =
  "color-mix(in oklab, var(--color-primary) 40%, transparent)";

export function ContestantsGrid({
  displayName,
  contestants,
}: {
  displayName: string;
  contestants: Contestant[];
}) {
  return (
    <main className="min-h-screen bg-background">
      <TopBanner displayName={displayName} page="contestants" />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
        <h1 className="text-2xl font-semibold text-primary">contestants</h1>

        {contestants.length === 0 ? (
          <p className="text-primary/70">No contestants yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
            {contestants.map((contestant) => {
              // Eliminated always wins over tribe color — once you're out,
              // you're out, regardless of which tribe you last belonged to.
              const borderColor = contestant.eliminated
                ? ELIMINATED_COLOR
                : (contestant.tribeColor ?? NO_TRIBE_COLOR);
              return (
                <div key={contestant.id} className="space-y-2">
                  <div
                    className="relative aspect-square border-4 bg-primary/5"
                    style={{ borderColor }}
                  >
                    {/* Placeholder box until real headshots are added. */}
                    <div className="flex h-full w-full items-center justify-center text-xs text-primary/30">
                      photo
                    </div>
                    {contestant.eliminated && (
                      <svg
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <line
                          x1="0"
                          y1="0"
                          x2="100"
                          y2="100"
                          stroke={ELIMINATED_COLOR}
                          strokeWidth="2"
                        />
                        <line
                          x1="100"
                          y1="0"
                          x2="0"
                          y2="100"
                          stroke={ELIMINATED_COLOR}
                          strokeWidth="2"
                        />
                      </svg>
                    )}
                  </div>
                  <p className="text-center text-sm text-primary">
                    {contestant.name}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
