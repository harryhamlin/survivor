import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/training-new-exercise";
import { createExercise, requireTrainingUser } from "../training/data.server";
import { trainingPath } from "../training/model";
import { BackLink, FocusFields, FormMessage, PageTitle, SaveButton } from "../training/ui";
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
  const next = new URL(request.url).searchParams.get("next");
  if (next === "workout") return redirect(trainingPath + "/new");
  if (next === "weekly-plan") return redirect(trainingPath + "/weekly-plan");
  return redirect(trainingPath + "/exercises");
}
export default function NewExercise({ actionData }: Route.ComponentProps) {
  return <div className="mx-auto max-w-sm"><BackLink to={trainingPath + "/exercises"}>Exercise library</BackLink>
    <PageTitle title="Add exercise"/>
    <Form method="post" className="tr-form">
      <label>Exercise name<input name="name" maxLength={80} required/></label>
      <FocusFields/>
      <label>Track by<select name="unit"><option value="reps">Repetitions</option><option value="seconds">Time in seconds</option></select></label>
      <FormMessage error={actionData?.error}/><SaveButton>Save exercise</SaveButton>
    </Form></div>;
}
