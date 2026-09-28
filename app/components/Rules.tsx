// Presentational component for the "/rules" page — the official rules
// document in full, as opposed to ScoringMetricsModal's short in-app
// summary of just the scoring mechanics.
import { TopBanner } from "./TopBanner";

export function Rules({ displayName }: { displayName: string }) {
  return (
    <main className="min-h-screen bg-background">
      <TopBanner displayName={displayName} page="rules" />
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-12 text-primary/80">
        <div>
          <h1 className="text-2xl font-semibold text-primary">
            Torch Snuffers — Official Rules
          </h1>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-primary">
            Simplified Overview
          </h2>
          <p className="text-sm">
            You&apos;ll submit your predicted <strong>Final 3 survivors</strong>{" "}
            and choose which of them you think will be the{" "}
            <strong>Ultimate Survivor</strong>.
          </p>
          <p className="text-sm">Then, each week:</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Pick the contestant you think will be eliminated that episode.</li>
            <li>
              Pick the tribe or contestant you think will win the immunity
              challenge.
            </li>
          </ol>
          <p className="text-sm">That&apos;s it. Detailed rules below.</p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-primary">General</h2>
          <p className="text-sm">
            There are three contests: <strong>Final 3</strong>,{" "}
            <strong>Weekly Elimination Pick</strong>, and{" "}
            <strong>Weekly Challenge Pick</strong>.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <strong>Final 3:</strong> Select the three contestants you think
              will make the Final 3, and designate one of them as your
              Ultimate Survivor.
            </li>
            <li>
              <strong>Weekly Elimination Pick:</strong> Each week, select the
              contestant you think will be eliminated.
            </li>
            <li>
              <strong>Weekly Challenge Pick:</strong> Each week, select the
              tribe (pre-merge) or contestant (post-merge) you think will win
              that week&apos;s immunity challenge.
            </li>
          </ul>
          <p className="text-sm">
            Weekly Elimination and Weekly Challenge picks begin with{" "}
            <strong>Week 2</strong>. Week 1 is excluded from both weekly
            contests.
          </p>
          <p className="text-sm">
            Final 3 picks are due{" "}
            <strong>September 30 at 8:00 PM Pacific</strong>.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-primary">Scoring</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              Correct weekly elimination pick:{" "}
              <strong>
                (contestants remaining, including the person voted out) ÷ 4,
                rounded up
              </strong>
            </li>
            <li>
              Incorrect weekly elimination pick: <strong>0 points</strong>
            </li>
            <li>
              Correct pre-merge tribe immunity winner:{" "}
              <strong>1 point</strong>
            </li>
            <li>
              Correct post-merge individual immunity winner:{" "}
              <strong>3 points</strong>
            </li>
            <li>
              Each correctly selected Final 3 contestant:{" "}
              <strong>4 points</strong>
            </li>
            <li>
              Correct Ultimate Survivor: <strong>4-point bonus</strong>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-primary">Fine Print</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <strong>$5 to play. Winner takes all.</strong>
            </li>
            <li>
              Week 1 is skipped for both the Weekly Elimination Pick and
              Weekly Challenge Pick contests.
            </li>
            <li>
              Final 3 picks are due{" "}
              <strong>September 30 at 8:00 PM Pacific</strong>.
            </li>
            <li>
              Weekly Elimination Picks and Weekly Challenge Picks are judged
              independently. You can select the same contestant for both
              contests if applicable.
            </li>
            <li>
              You may select the same contestant or tribe multiple times
              throughout the season for weekly picks, provided that
              contestant remains eligible.
            </li>
            <li>
              During the pre-merge period, multiple tribes may receive
              immunity in a given episode, but typically one tribe wins the
              challenge. You only score points if you select the official
              challenge winner.
            </li>
            <li>
              During the post-merge period, multiple contestants may
              occasionally win immunity simultaneously. If you select any
              official winner, you receive the applicable points.
            </li>
            <li>
              If multiple contestants are eliminated during an episode,
              selecting any contestant who is officially eliminated counts as
              a correct Weekly Elimination Pick.
            </li>
            <li>
              A contestant leaving the show for a reason other than
              elimination at Tribal Council does <strong>not</strong> count as
              an elimination.
            </li>
            <li>
              If no contestant is eliminated during an episode, the Weekly
              Elimination Pick contest is a <strong>push</strong> for that
              episode and no points are awarded or deducted.
            </li>
            <li>
              In the event of a tribe shuffle or other format change that
              prevents a normal immunity prediction from being scored, the
              Weekly Challenge Pick will count as a <strong>push</strong>.
            </li>
            <li>Weekly Challenge Picks apply to immunity challenges only.</li>
            <li>
              Weekly contests are judged independently. An elimination push
              does not necessarily void the immunity contest, and an immunity
              push does not necessarily void the elimination contest.
            </li>
            <li>
              If an episode contains multiple immunity challenges, selecting
              a contestant who wins any applicable immunity challenge counts
              as a correct pick unless otherwise announced. You cannot score
              multiple times from a single weekly pick.
            </li>
            <li>
              In the final episode, there are typically multiple eliminations
              before the Final 3 is established. Your Weekly Elimination Pick
              covers the applicable pre-Final-3 eliminations for the entire
              episode. The Final Tribal Council jury vote does not count as
              an elimination.
            </li>
            <li>
              Final 3 scoring is based on the{" "}
              <strong>post-firemaking Final 3</strong>.
            </li>
            <li>
              The unexpected always happens, and I&apos;ll do my best to
              accommodate it justly. ⚖️👨🏻‍⚖️
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-primary">Tiebreakers</h2>
          <p className="text-sm">In the event of a tie:</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              Whoever correctly picked the <strong>Ultimate Survivor</strong>{" "}
              wins the tiebreaker.
            </li>
            <li>
              If still tied, whoever correctly selected the greatest number
              of <strong>Final 3 contestants</strong> wins.
            </li>
            <li>
              If still tied, whoever correctly selected the greatest number
              of <strong>individual immunity challenge winners</strong> wins.
            </li>
            <li>
              If still tied, add one point to each scoring value and
              recalculate the season totals. Highest score wins.
            </li>
            <li>
              If somehow still tied:{" "}
              <strong>NFL Combine-style athletic competition.</strong>
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
