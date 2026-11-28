"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../_lib/apiClient";

export function FakeCheckout({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const send = async (outcome: "pay" | "abandon") => {
    const res = await api(`/api/dev/checkout/${bookingId}`, { method: "POST", body: JSON.stringify({ outcome }) });
    if (!res.ok) return setError(res.error.message);
    router.push(`/bookings/${bookingId}${outcome === "pay" ? "?paid=1" : ""}`);
  };
  return (
    <div className="row">
      <button className="btn btn-primary btn-lg" onClick={() => send("pay")}>Pay now</button>
      <button className="btn" onClick={() => send("abandon")}>Let it expire</button>
      {error && <p className="notice error" role="alert">{error}</p>}
    </div>
  );
}
