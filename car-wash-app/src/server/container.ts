import "server-only";
import { env } from "@/config/env";
import { prisma } from "@/infra/db/prisma";
import {
  PrismaBookingRepository,
  PrismaCatalogRepository,
  PrismaUserRepository,
  PrismaWebhookEventLog,
} from "@/infra/db/prismaRepositories";
import { FakeGateway } from "@/infra/payments/fakeGateway";
import { StripeGateway } from "@/infra/payments/stripeGateway";
import { MemoryRateLimiter } from "@/infra/ratelimit/memoryRateLimiter";
import { jsonLogger, systemClock } from "@/infra/system";

/**
 * Composition root: the only place that knows which adapter implements each port.
 * Use cases receive these as plain arguments, which keeps them testable with fakes.
 */
function build() {
  const e = env();
  const stripe = e.STRIPE_SECRET_KEY ? new StripeGateway(e.STRIPE_SECRET_KEY, e.APP_URL) : null;
  return {
    catalog: new PrismaCatalogRepository(prisma),
    bookings: new PrismaBookingRepository(prisma),
    users: new PrismaUserRepository(prisma),
    events: new PrismaWebhookEventLog(prisma),
    payments: stripe ?? new FakeGateway(e.APP_URL),
    stripe,
    rateLimiter: new MemoryRateLimiter(),
    clock: systemClock,
    logger: jsonLogger,
  };
}

export type Container = ReturnType<typeof build>;

const globalForContainer = globalThis as unknown as { container?: Container };

export function container(): Container {
  globalForContainer.container ??= build();
  return globalForContainer.container;
}
