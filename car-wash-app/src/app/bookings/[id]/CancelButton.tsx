"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../_lib/apiClient";

export function CancelButton({ bookingId, version, refundText }: { bookingId: string; version: number; refundText: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) return <button className="danger" onClick={() => setConfirming(true)}>Cancel booking</button>;
  return (
    <div className="notice warn" style={{ width: "100%" }}>
      <p>Cancel this booking? {refundText}</p>
      <div className="row">
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await api(`/api/v1/bookings/${bookingId}/cancel`, {
              method: "POST",
              body: JSON.stringify({ expectedVersion: version }),
            });
            setBusy(false);
            if (res.ok) { setConfirming(false); router.refresh(); return; }
            setError(res.error.message);
            if (res.error.kind === "Conflict") router.refresh();
          }}
        >
          {busy ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={busy}>Keep booking</button>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
    </div>
  );
}
