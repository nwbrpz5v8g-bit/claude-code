"use client";
import { useRouter } from "next/navigation";
import { api } from "../_lib/apiClient";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button className="btn btn-sm btn-ghost"
      onClick={async () => {
        await api("/api/v1/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
