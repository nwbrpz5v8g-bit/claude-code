import { z } from "zod";
import { env } from "@/config/env";
import { err, ok } from "@/domain/shared/result";
import { container } from "@/server/container";
import { startSession } from "@/server/auth/session";
import { RATE_LIMITS, readJson, route, zodIssues } from "@/server/http/handler";
import { errorToResponse } from "@/server/http/errorToResponse";

const body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** Passwordless dev login. Disabled unless AUTH_DEV_LOGIN=true, and env validation forbids that in production. */
export const POST = route(RATE_LIMITS.login, async ({ req }) => {
  if (!env().AUTH_DEV_LOGIN) return errorToResponse({ kind: "NotFound", entity: "User" });
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return err(zodIssues(parsed.error));
  const user = await container().users.upsertByEmail(parsed.data.email);
  await startSession(user.id);
  return ok({ id: user.id, email: user.email, role: user.role });
});
