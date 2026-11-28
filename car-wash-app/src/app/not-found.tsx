import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel empty">
      <div className="art" aria-hidden="true">🫧</div>
      <h1>Washed away</h1>
      <p className="muted">That page or booking doesn't exist, or you don't have access to it.</p>
      <Link className="btn btn-primary" href="/">Back to locations</Link>
    </div>
  );
}
