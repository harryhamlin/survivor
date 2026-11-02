export function ExtraPickRules({ deadline }: { deadline?: string }) {
  return (
    <p className="text-sm text-primary/80">
      In the spirit of permanent uncertainty, all Fantasy Survivor players
      with a complete original team may add one additional contestant still in
      the game who is not already on their team to their Final 3
      prediction. At the end of the season, the top three of your four selected
      contestants will count toward your Final 3 score. Your original picks
      remain locked. Your Ultimate Survivor stays exactly as selected at the
      beginning of the season and cannot be changed or reassigned to your
      fourth pick. Only the fourth pick can be changed during this window.
      {deadline
        ? ` Submit or update your fourth pick by ${deadline}, the weekly picks deadline.`
        : " Submit or update your fourth pick by the deadline shown on your dashboard."}
      {" "}Each selected contestant who reaches the actual Final 3 earns 4
      points, up to 12 finalist points total. Fourth place earns no finalist
      points. The 4-point Ultimate Survivor bonus still applies only if your
      original Ultimate Survivor pick wins the season.
    </p>
  );
}
