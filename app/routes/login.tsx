import type { Route } from "./+types/login";
import { authenticate } from "../login.server";
import { LoginForm } from "../components/LoginForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "sign in" }, { name: "description", content: "Sign in" }];
}

export function action({ request }: Route.ActionArgs) {
  return authenticate(request, "/");
}

export default function Login({ actionData }: Route.ComponentProps) {
  return <LoginForm error={actionData?.error} />;
}
