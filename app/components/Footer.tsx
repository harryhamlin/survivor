// Rendered by the root layout on every page, logged in or not — a "report a
// bug" link that opens a modal with a plain textarea, submitted via fetcher
// to the "/report-bug" resource route so it never navigates away from
// whatever page it was opened on. Who the report is from (if anyone) is
// decided server-side from the session cookie, not anything passed in here.
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

export function Footer() {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ error?: string; success?: boolean }>();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setOpen(false);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <footer className="w-full border-t border-primary/40 px-4 py-4 text-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-primary/70 hover:underline"
      >
        report a bug
      </button>

      {open && (
        // Clicking the dimmed backdrop closes the modal; clicking inside the
        // dialog itself must not (hence stopPropagation on the inner div).
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-bug-title"
            className="w-full max-w-sm space-y-4 border border-primary/40 bg-background p-6 text-left"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2
                id="report-bug-title"
                className="text-lg font-semibold text-primary"
              >
                report a bug
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-primary/70 hover:text-primary"
              >
                ✕
              </button>
            </div>
            <fetcher.Form
              method="post"
              action="/report-bug"
              className="space-y-4"
            >
              <textarea
                name="report"
                required
                rows={4}
                // Matches MAX_REPORT_LENGTH in the report-bug route's
                // action — this is just a UX nicety, the real enforcement
                // happens server-side.
                maxLength={2000}
                placeholder="what went wrong?"
                className="w-full border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {fetcher.data?.error && (
                <p className="text-sm text-red-500">{fetcher.data.error}</p>
              )}
              <button
                type="submit"
                disabled={fetcher.state !== "idle"}
                className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90 disabled:opacity-40"
              >
                submit
              </button>
            </fetcher.Form>
          </div>
        </div>
      )}
    </footer>
  );
}
