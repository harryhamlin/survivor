// The top bar shown on the dashboard: greets the user by name and provides
// the logout button. Shared by both dashboard states (picker and roster).
import { Form } from "react-router";

export function DashboardHeader({ username }: { username: string }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-primary">
        {username}
      </h1>
      {/* Posting to /logout (a separate route) rather than handling this in
          the dashboard's own action keeps "log out" independent of whatever
          the dashboard's action is doing (saving a team). */}
      <Form method="post" action="/logout">
        <button
          type="submit"
          className="text-sm text-primary/70 hover:underline"
        >
          Log out
        </button>
      </Form>
    </div>
  );
}
