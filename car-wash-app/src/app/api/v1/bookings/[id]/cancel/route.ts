import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { err } from "@/domain/shared/result";
import { cancelBooking } from "@/application/use-cases/cancelBooking";
import { container } from "@/server/container";
import { RATE_LIMITS, readJson, route, zodIssues } from "@/server/http/handler";
import { errorToResponse } from "@/server/http/errorToResponse";

const body = z.object({ expectedVersion: z.number().int().positive().optional() }).default({});

export const POST = route<{ id: string }>(RATE_LIMITS.mutateBooking, async ({ actor, req, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) return errorToResponse({ kind: "NotFound", entity: "Booking" });
  const parsed = body.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return err(zodIssues(parsed.error));
  return cancelBooking(container(), actor, { bookingId: asId(params.id), expectedVersion: parsed.data.expectedVersion });
});
