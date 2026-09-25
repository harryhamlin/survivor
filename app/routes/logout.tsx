// The "/logout" route. It has no page of its own — it only exists to handle
// the POST from the "Log out" button (see DashboardHeader) and clear the
// session.
import type { Route } from "./+types/logout";
import { logout } from "../session.server";

export async function action({ request }: Route.ActionArgs) {
  return logout(request);
}
