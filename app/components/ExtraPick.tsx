import { Form, useNavigation } from "react-router";

export function ExtraPick({ contestants, currentPickId, deadline, error }: {
  contestants: { id: number; name: string }[];
  currentPickId?: number;
  deadline: string;
  error?: string;
}) {
  const navigation = useNavigation();
  const saving = navigation.state !== "idle" && navigation.formData?.get("intent") === "extra-pick";
  return (
    <div className="space-y-3 border border-primary/40 p-4">
      <h2 className="text-lg text-primary">{currentPickId ? "Edit your fourth contestant" : "Add a fourth contestant"}</h2>
      <p className="text-sm text-primary/70">
        Add one contestant to your team. Your original picks and Ultimate Survivor stay locked.
        Your extra pick earns 4 points if they reach the final 3.
      </p>
      <p className="text-sm text-primary/70">You can change this pick until {deadline}.</p>
      <Form method="post" className="space-y-3">
        <input type="hidden" name="intent" value="extra-pick" />
        <label htmlFor="extraContestantId" className="block text-sm text-primary/70">Fourth contestant</label>
        <select key={currentPickId ?? "new"} id="extraContestantId" name="contestantId" required
          defaultValue={currentPickId ?? ""}
          className="w-full border border-primary/40 bg-background px-3 py-2 text-primary">
          <option value="" disabled>Select a contestant</option>
          {contestants.map((contestant) => <option key={contestant.id} value={contestant.id}>{contestant.name}</option>)}
        </select>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={saving || contestants.length === 0}
          className="w-full bg-primary px-3 py-2 font-medium text-black hover:opacity-90 disabled:opacity-40">
          {saving ? "Saving…" : "Save fourth pick"}
        </button>
      </Form>
    </div>
  );
}
