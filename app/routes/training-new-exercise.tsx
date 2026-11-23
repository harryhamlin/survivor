import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/training-new-exercise";
import { createExercise, requireTrainingUser } from "../training/data.server";
import { equipmentOptions, trainingPath } from "../training/model";
import { BackLink, FocusField, FormMessage, PageTitle, SaveButton } from "../training/ui";
import { readFormData } from "../security.server";

export const meta = () => [{ title: "Add exercise | Torchsnuffers Training" }];
export async function loader({ request }: Route.LoaderArgs) {
  await requireTrainingUser(request);
  return null;
}
export async function action({ request }: Route.ActionArgs) {
  const userId = await requireTrainingUser(request);
  const error = await createExercise(userId, await readFormData(request));
  if (error) return data({ error }, { status: 400 });
  return redirect(trainingPath + "/exercises");
}
export default function NewExercise({ actionData }: Route.ComponentProps) {
  return <div className="tr-narrow"><BackLink to={trainingPath + "/exercises"}>Exercise library</BackLink>
    <PageTitle title="Add exercise"/><p className="tr-intro">Save a movement to your personal library.</p>
    <Form method="post" className="tr-form">
      <label>Exercise name<input name="name" maxLength={80} required/></label>
      <div className="tr-pair"><FocusField/><label>Equipment<select name="equipment">{equipmentOptions.map(e => <option key={e}>{e}</option>)}</select></label></div>
      <label>Track by<select name="unit"><option value="reps">Repetitions</option><option value="seconds">Time in seconds</option></select></label>
      <label>Movement cues (optional)<textarea name="cue" maxLength={500} rows={3}/></label>
      <FormMessage error={actionData?.error}/><SaveButton>Save exercise</SaveButton>
    </Form></div>;
}
