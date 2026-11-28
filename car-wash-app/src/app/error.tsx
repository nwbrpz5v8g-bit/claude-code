"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card empty">
      <h1>Something went wrong</h1>
      <p className="muted">Please try again.{error.digest && ` Reference: ${error.digest}`}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
