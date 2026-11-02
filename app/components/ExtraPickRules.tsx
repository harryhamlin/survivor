export function ExtraPickRules({ deadline }: { deadline?: string }) {
  return (
    <p className="text-sm text-primary/80">
      In the spirit of permanent uncertainty, all Fantasy Survivor players
      may add one additional contestant still in the game to their Final 3
      prediction. At the end of the season, the top three of your four selected
      contestants will count toward your Final 3 score. Your original picks
      and Ultimate Survivor remain locked.
      {deadline
        ? ` Submit or update your fourth pick by ${deadline}, the weekly picks deadline.`
        : " Submit or update your fourth pick by the deadline shown on your dashboard."}
    </p>
  );
}
