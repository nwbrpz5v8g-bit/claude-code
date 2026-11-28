import { ok } from "@/domain/shared/result";
import { endSession } from "@/server/auth/session";
import { route } from "@/server/http/handler";

export const POST = route(null, async () => {
  await endSession();
  return ok({ signedOut: true });
});
