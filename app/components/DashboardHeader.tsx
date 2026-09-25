import { Form } from "react-router";

export function DashboardHeader({ username }: { username: string }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-primary">
        Welcome, {username}
      </h1>
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
