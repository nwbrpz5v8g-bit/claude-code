import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "@/config/env";
import { asId } from "@/domain/shared/ids";
import type { Actor } from "@/application/actor";
import { container } from "../container";

/**
 * Minimal signed-cookie session (HS256 JWT, httpOnly, SameSite=Lax).
 * This is the auth port of the app: swap for Auth.js or Clerk by
 * re-implementing `currentActor`, `startSession` and `endSession`.
 */
const COOKIE = "cw_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

const claims = z.object({ sub: z.string().uuid() });

const key = () => new TextEncoder().encode(env().AUTH_SECRET);

export async function startSession(userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * Resolves the caller. Invalid, expired or tampered tokens, and tokens for
 * deleted users, all resolve to anonymous: the use case then returns
 * Unauthenticated, never a 500.
 */
export async function currentActor(): Promise<Actor> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return { kind: "anonymous" };
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const parsed = claims.safeParse(payload);
    if (!parsed.success) return { kind: "anonymous" };
    const user = await container().users.findById(asId(parsed.data.sub));
    if (!user) return { kind: "anonymous" };
    return { kind: "user", id: user.id, email: user.email, role: user.role };
  } catch {
    return { kind: "anonymous" };
  }
}
