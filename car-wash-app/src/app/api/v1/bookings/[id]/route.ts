import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { ok } from "@/domain/shared/result";
import { getBooking } from "@/application/use-cases/queries";
import { container } from "@/server/container";
import { toBookingDto } from "@/server/http/dto";
import { route } from "@/server/http/handler";
import { errorToResponse } from "@/server/http/errorToResponse";

export const GET = route<{ id: string }>(null, async ({ actor, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) return errorToResponse({ kind: "NotFound", entity: "Booking" });
  const result = await getBooking(container(), actor, asId(params.id));
  return result.ok ? ok(toBookingDto(result.value)) : result;
});
