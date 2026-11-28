import Link from "next/link";
import { container } from "@/server/container";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locations = await container().catalog.listActiveLocations();
  return (
    <>
      <h1>Book a wash</h1>
      {locations.length === 0 ? (
        <div className="card empty">
          <h2>No locations are open for booking yet</h2>
          <p className="muted">Check back soon. New locations are added regularly.</p>
        </div>
      ) : (
        locations.map((l) => (
          <div className="card row" key={l.id} style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{l.name}</strong>
              <div className="muted">{l.address}</div>
              <div className="muted" style={{ fontSize: 14 }}>Times shown in {l.timezone.replace("_", " ")}</div>
            </div>
            <Link className="button primary" href={`/book/${l.id}`}>Book here</Link>
          </div>
        ))
      )}
    </>
  );
}
