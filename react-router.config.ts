import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // React Router rejects form/action submissions whose browser `Origin`
  // header doesn't match the request's own origin, as CSRF protection. Behind
  // Heroku's proxy the app sees itself as plain http while the browser sends
  // https, so every real submission would otherwise be rejected as a
  // mismatch — these are the actual domains this app is served from.
  allowedActionOrigins: [
    "torchsnuffers.com",
    "www.torchsnuffers.com",
    "survivor-hham-6f0280b70284.herokuapp.com",
  ],
} satisfies Config;
