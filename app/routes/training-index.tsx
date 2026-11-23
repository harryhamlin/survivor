import { redirect } from "react-router";
import { trainingPath } from "../training/model";

// The workout tracker opens on the training log, which lists the locked-in week.
export const loader = () => redirect(trainingPath + "/log");
export default function TrainingIndex() {
  return null;
}
