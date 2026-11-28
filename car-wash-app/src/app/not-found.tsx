import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card empty">
      <h1>Not found</h1>
      <p className="muted">That page or booking doesn't exist, or you don't have access to it.</p>
      <Link className="button" href="/">Back to locations</Link>
    </div>
  );
}
