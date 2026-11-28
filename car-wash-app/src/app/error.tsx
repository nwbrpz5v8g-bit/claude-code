"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel empty">
      <div className="art" aria-hidden="true">💦</div>
      <h1>We hit a puddle</h1>
      <p className="muted">Please try again.{error.digest && ` Reference: ${error.digest}`}</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
