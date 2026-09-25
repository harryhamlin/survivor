import type { Route } from "./+types/logout";
import { logout } from "../session.server";

export async function action({ request }: Route.ActionArgs) {
  return logout(request);
}
