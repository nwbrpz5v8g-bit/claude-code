import { env } from "@/config/env";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  // Only allow same-site relative paths to prevent open redirects.
  const safeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  if (!env().AUTH_DEV_LOGIN) {
    return (
      <div className="card">
        <h1>Sign in</h1>
        <p>No sign-in provider is configured. Connect Auth.js or Clerk in <code>src/server/auth/session.ts</code>.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h1>Sign in</h1>
      <p className="notice warn">Development login: any email signs you in, no password. Disabled in production.</p>
      <LoginForm returnTo={safeReturn} />
    </div>
  );
}
