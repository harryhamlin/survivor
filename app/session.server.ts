import "dotenv/config";
import { createCookieSessionStorage, redirect } from "react-router";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function createUserSession(userId: number, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function getUserId(request: Request) {
  const session = await getSession(request);
  const userId = session.get("userId");
  return typeof userId === "number" ? userId : null;
}

export async function requireUserId(request: Request) {
  const userId = await getUserId(request);
  if (userId === null) {
    throw redirect("/");
  }
  return userId;
}

export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}
