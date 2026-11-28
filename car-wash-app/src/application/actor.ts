import type { UserId } from "@/domain/shared/ids";
import type { Role } from "./ports/repositories";

export type Actor =
  | { kind: "anonymous" }
  | { kind: "user"; id: UserId; email: string; role: Role };

export const isStaffOrAdmin = (a: Actor): boolean =>
  a.kind === "user" && (a.role === "STAFF" || a.role === "ADMIN");
