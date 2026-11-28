"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../_lib/apiClient";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await api("/api/v1/auth/dev-login", { method: "POST", body: JSON.stringify({ email }) });
        setBusy(false);
        if (!res.ok) {
          setError(res.status === 429 ? `Too many attempts. Try again in ${res.retryAfterSec ?? 60}s.` : res.error.message);
          return;
        }
        router.push(returnTo);
        router.refresh();
      }}
    >
      <label htmlFor="email" className="muted">Email</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      {error && <p className="notice error" role="alert" style={{ width: "100%" }}>{error}</p>}
    </form>
  );
}
