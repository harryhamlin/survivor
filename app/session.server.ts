// Cookie-based login session handling, used by the login/logout/dashboard
// routes to know which user (if any) is making a request.
import "dotenv/config";
import { createCookieSessionStorage, redirect } from "react-router";

// The secret used to sign the session cookie so it can't be forged or
// tampered with by the client. Must be set as an env var (see .env.example);
// failing loudly at startup is intentional — a missing secret should never
// silently fall back to something insecure.
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

// The session itself is stored entirely in the signed cookie (no server-side
// session table) — it just holds the logged-in user's id.
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true, // not readable from client-side JS
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production", // HTTPS-only in production
  },
});

// Called on successful login: stashes the user's id in a new session and
// redirects the browser to `redirectTo`, sending back the Set-Cookie header
// that actually starts the session.
export async function createUserSession(userId: number, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

// Reads the session (if any) out of the request's Cookie header.
function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

// Returns the logged-in user's id, or null if the request has no valid
// session. Use this when a route wants to know who's logged in without
// forcing them to be.
export async function getUserId(request: Request) {
  const session = await getSession(request);
  const userId = session.get("userId");
  return typeof userId === "number" ? userId : null;
}

// Use this in a loader/action to guard a page that requires being logged
// in — throwing a redirect (rather than returning one) short-circuits the
// loader/action entirely and sends the browser to the login page.
export async function requireUserId(request: Request) {
  const userId = await getUserId(request);
  if (userId === null) {
    throw redirect("/login");
  }
  return userId;
}

// Destroys the session cookie and sends the browser back to the login page.
export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}
