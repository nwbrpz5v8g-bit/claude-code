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
      className="stack"
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
      <label htmlFor="email">Email</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
      {error && <p className="notice error" role="alert">{error}</p>}
    </form>
  );
}
