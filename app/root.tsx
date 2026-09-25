// The root layout for every route in the app (React Router "framework mode"
// root route). It owns the outer <html>/<head>/<body> shell, so every page
// gets this document structure without repeating it per route.
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

// <link> tags injected into <head> on every page. Currently just the
// favicon; React Router merges this with any route-specific `links` export.
export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/png", href: "/favicon.png" },
];

// The actual HTML document shell. `children` is wherever the router decides
// to render the matched route tree (via the default export below).
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// The root route's own component — just renders whichever child route
// matched the current URL.
export default function App() {
  return <Outlet />;
}

// Catches any error thrown by a loader/action/render anywhere in the route
// tree (including a thrown Response like a 404) and shows a fallback page
// instead of a blank screen. Stack traces are only shown in dev.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
