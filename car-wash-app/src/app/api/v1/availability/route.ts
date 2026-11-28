import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { getAvailability } from "@/application/use-cases/getAvailability";
import { container } from "@/server/container";
import { RATE_LIMITS, route, zodIssues } from "@/server/http/handler";
import { err, ok } from "@/domain/shared/result";

const query = z.object({
  locationId: z.string().uuid(),
  packageId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional(),
});

export const GET = route(RATE_LIMITS.availability, async ({ req }) => {
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return err(zodIssues(parsed.error));
  const result = await getAvailability(container(), {
    locationId: asId(parsed.data.locationId),
    packageId: asId(parsed.data.packageId),
    localDate: parsed.data.date,
  });
  if (!result.ok) return result;
  const v = result.value;
  return ok({
    ...v,
    slots: v.slots.map((s) => ({ ...s, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
  });
});
