import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { err, ok } from "@/domain/shared/result";
import { bookWash } from "@/application/use-cases/bookWash";
import { listMyBookings } from "@/application/use-cases/queries";
import { container } from "@/server/container";
import { toBookingDto } from "@/server/http/dto";
import { RATE_LIMITS, readJson, route, zodIssues } from "@/server/http/handler";
import { success } from "@/server/http/errorToResponse";

const body = z.object({
  locationId: z.string().uuid(),
  packageId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  expectedPriceCents: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});

export const POST = route(RATE_LIMITS.createBooking, async ({ actor, req }) => {
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return err(zodIssues(parsed.error));
  const result = await bookWash(container(), actor, {
    locationId: asId(parsed.data.locationId),
    packageId: asId(parsed.data.packageId),
    startsAt: new Date(parsed.data.startsAt),
    expectedPriceCents: parsed.data.expectedPriceCents,
    idempotencyKey: parsed.data.idempotencyKey,
  });
  return result.ok ? success(result.value, 201) : result;
});

export const GET = route(null, async ({ actor }) => {
  const result = await listMyBookings(container(), actor);
  return result.ok ? ok(result.value.map(toBookingDto)) : result;
});
