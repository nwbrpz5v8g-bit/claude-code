import { timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { container } from "@/server/container";

function authorized(req: Request): boolean {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Run every minute from a scheduler (Vercel Cron, QStash, k8s CronJob). Idempotent. */
export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const c = container();
  const expired = await c.bookings.expireStaleHolds(c.clock.now());
  if (expired > 0) c.logger.info("expired stale payment holds", { count: expired });
  return Response.json({ expired });
}
