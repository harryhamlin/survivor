// The "/" route. There's no real landing page content — this just sends
// visitors straight to the login page.
import { redirect } from "react-router";

export async function loader() {
  return redirect("/login");
}
