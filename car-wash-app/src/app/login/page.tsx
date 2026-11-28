import { env } from "@/config/env";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  // Only allow same-site relative paths to prevent open redirects.
  const safeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  if (!env().AUTH_DEV_LOGIN) {
    return (
      <div className="panel">
        <h1>Sign in</h1>
        <p>No sign-in provider is configured. Connect Auth.js or Clerk in <code>src/server/auth/session.ts</code>.</p>
      </div>
    );
  }
  return (
    <div className="panel" style={{ maxWidth: 460, margin: "24px auto" }}>
      <p className="eyebrow">Almost there</p>
      <h1 style={{ fontSize: "2.2rem" }}>Who's driving?</h1>
      <p className="muted">We'll keep your booking right where you left it.</p>
      <p className="notice warn" style={{ fontSize: 14 }}>Dev login: any email works, no password. Disabled in production.</p>
      <LoginForm returnTo={safeReturn} />
    </div>
  );
}
