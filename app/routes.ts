// The app's route table. Each entry maps a URL path to the route module
// (loader/action/component) that handles it, in app/routes/.
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // "/" itself isn't a real page — home.tsx just redirects to /login.
  // (Login used to live directly on "/" as an index route, but index routes
  // share their URL with this parent, which forces React Router to add a
  // `?index` query param to disambiguate form submissions. Giving login its
  // own real path avoids that entirely.)
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("logout", "routes/logout.tsx"),
] satisfies RouteConfig;
