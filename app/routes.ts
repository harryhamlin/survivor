// The app's route table. Each entry maps a URL path to the route module
// (loader/action/component) that handles it, in app/routes/.
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // "/" is the public standings summary (home.tsx), not the login page.
  // Login used to live directly on "/" as an index route, but index routes
  // share their URL with this parent, which forces React Router to add a
  // `?index` query param to disambiguate form submissions — giving login its
  // own real path avoids that entirely.
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  // "/leaderboard" is the logged-in-only detailed view (every player's
  // draft, score, and full per-episode pick history) — distinct from "/"'s
  // public one-line-per-player summary.
  route("leaderboard", "routes/leaderboard.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
