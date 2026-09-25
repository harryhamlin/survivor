// Full-width banner shown at the top of every authenticated page: the
// logged-in user's name on the left, logout on the right. Meant to span the
// entire viewport width, so route components render it *outside* their
// narrower centered content column, not inside it.
import { Form } from "react-router";

export function TopBanner({ username }: { username: string }) {
  return (
    <div className="flex w-full items-center justify-between border-b border-primary/40 px-4 py-4">
      <p className="text-lg font-semibold text-primary">{username}</p>
      {/* Posting to /logout (a separate route) keeps "log out" independent
          of whatever action the current page's own form submits to. */}
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
