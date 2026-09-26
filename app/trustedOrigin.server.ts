// Builds a base URL that's safe to email back to a user (e.g. in a password
// reset link) — unlike `new URL(request.url).origin`, which is derived from
// the request's Host header and so isn't safe to trust as-is: a request
// reaching the app through anything other than Heroku's normal routing could
// carry an attacker-controlled Host, and a reset link built from that would
// point at the attacker's domain instead of ours while still carrying a
// valid reset token in the path.
import routerConfig from "../react-router.config";

const ALLOWED_HOSTS = routerConfig.allowedActionOrigins ?? [];
const CANONICAL_ORIGIN = `https://${ALLOWED_HOSTS[0]}`;

export function getTrustedOrigin(request: Request): string {
  // Locally there's no proxy and no attacker-controlled Host in play — it's
  // just whatever `npm run dev` is bound to — so the request's own origin is
  // fine to use as-is.
  if (process.env.NODE_ENV !== "production") {
    return new URL(request.url).origin;
  }
  const host = new URL(request.url).host;
  return ALLOWED_HOSTS.includes(host) ? `https://${host}` : CANONICAL_ORIGIN;
}
