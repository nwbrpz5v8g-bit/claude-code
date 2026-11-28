# SUDS: car wash, sorted

A Next.js (App Router) app for booking car washes. It covers availability across
time zones, booking with a payment hold, payment confirmation via webhook, and
customer cancellation with a refund policy.

## What makes it SUDS

- **Quiet Hours pricing.** Weekday slots from 13:00 to 16:00 local time are 20% off, to move demand off
  the weekend rush. The price is computed server-side per slot (`domain/pricing/quote.ts`), checked
  against what the customer saw, and snapshotted on the booking.
- **Crowd forecast.** Every slot shows **Calm / Steady / Busy** from the share of free bays, so customers
  can pick a time with no wait.
- **Wash Pass.** The confirmation is a ticket with a short check-in code (`SUDS-7K3Q-M2`), derived from
  the booking id in Crockford base32 so it is easy to read out at the bay (`domain/booking/checkInCode.ts`).
  It identifies a booking but grants nothing on its own; staff check-in will verify it with the date and location.
- **Night-wash identity.** Ink blue, aqua foam and neon pink, with Bricolage Grotesque for display text.
  Packages are shown as foam levels, days as a scrollable strip, slots as a timeline grouped by
  morning, afternoon and evening, and the price sits in a sticky bar showing the discount.
  Light and dark themes are included, and the bubble animations are disabled under `prefers-reduced-motion`.

## Run it locally

Requires Node 20+ and PostgreSQL 14+ (with the `btree_gist` extension, which ships with Postgres).

```bash
cp .env.example .env        # then set AUTH_SECRET and CRON_SECRET to random values
npm install
npm run db:migrate          # applies prisma/migrations
npm run db:seed             # 2 locations (New York, Los Angeles), 3 packages
npm run dev                 # http://localhost:3000
```

With `STRIPE_SECRET_KEY` empty, payments go through an in-app **test checkout**
(`/dev/checkout/:id`) that drives the same code path as the Stripe webhook.
Sign-in is a passwordless **dev login** (`AUTH_DEV_LOGIN=true`). Both are refused
at boot when `NODE_ENV=production`.

## Tests

```bash
npm test                                         # unit + use-case tests
TEST_DATABASE_URL=postgresql://…/carwash_test \  # + Postgres integration tests
  npm test                                       #   (DB must be migrated and disposable: it is truncated)
npm run typecheck
```

The integration suite runs 20 concurrent bookings against a real database to
prove the no-double-booking guarantee.

## Architecture

```
src/
  domain/        Pure TypeScript: entities, state machine, policies, slot generation. No I/O, no framework.
  application/   Use cases (bookWash, getAvailability, handlePaymentEvent, cancelBooking) and the ports they need.
  infra/         Adapters: Prisma repositories, Stripe and fake payment gateways, rate limiter, clock, logger.
  server/        Composition root (container.ts), session auth, HTTP error mapping and the route wrapper.
  app/           Next.js pages and /api/v1 route handlers. Thin: parse with Zod → call a use case → map the Result.
  config/env.ts  Zod-validated environment; fails fast with a clear message.
```

Dependencies point inward only: `app → server → application → domain`, with
`infra` implementing `application/ports`. Use cases are tested with in-memory
fakes (`tests/support/fakes.ts`).

### Error handling

Expected failures are values: every use case returns `Result<T, DomainError>`.
`DomainError` is a closed union, and `server/http/errorToResponse.ts` maps it to
HTTP with an exhaustive `switch`, so adding an error kind fails to compile until
it is mapped. Unexpected exceptions become an opaque 500 with a request id, logged as JSON.

### Workflows implemented

| Workflow | Where |
|---|---|
| W1: book a wash (location → package → slot → pay) | `bookWash`, `getAvailability`, `/book/[locationId]` |
| Payment confirmation and expiry | `handlePaymentEvent`, `/api/webhooks/stripe`, `/api/internal/cron/expire-holds` |
| W2: view and cancel bookings | `cancelBooking`, `/bookings`, `/bookings/[id]` |
| W3 memberships, W4 staff queue, W5 admin | Not built yet. The schema, roles and state machine are ready for them. |

### Edge cases handled

- **Double booking.** A Postgres exclusion constraint (`booking_no_bay_overlap`) makes overlapping
  active bookings on one bay impossible. Inserts take a per-bay advisory lock, because concurrent
  inserts on an exclusion constraint can otherwise deadlock (`40P01`). If a request loses the race,
  the next free bay is tried, then the request fails with `SlotUnavailable`.
- **Retries and double clicks.** The client sends an `idempotencyKey` per checkout attempt. It is
  unique in the DB and forwarded to Stripe. A replay returns the same booking, and reusing a key for
  a different request is rejected.
- **Abandoned payment.** A slot is held for 10 minutes in `PENDING_PAYMENT`, then expired
  (lazily on each availability or booking request, and by the cron endpoint).
- **Webhooks.** Signatures are verified and events deduplicated by id. An event is recorded only
  after it is processed, so a failure returns non-2xx and Stripe retries. Out-of-order events are
  absorbed by the state machine. A payment that arrives after the hold expired is refunded automatically.
- **Time zones and DST.** Instants are stored in UTC. Opening hours are local wall time in the
  location's IANA zone. Slots are generated in real time between resolved open and close instants,
  so spring-forward days have no phantom slots and fall-back days show the repeated hour twice with
  zone labels. The UI always shows the location's time, not the viewer's.
- **Auth failures.** Missing, expired or tampered sessions resolve to anonymous, and use cases
  return `Unauthenticated` (401). The UI sends the user to sign in with the booking draft kept in the URL.
  Another customer's booking returns 404, never 403, so ids cannot be probed.
- **Rate limits.** Per user or IP sliding windows (booking 5/min, availability 60/min, login 10/15 min)
  return 429 with `Retry-After`. Stripe calls retry with backoff.
- **Price changes.** The client sends the slot price it showed (after any Quiet Hours discount), and a
  mismatch is rejected. Bookings snapshot the price and package name.
- **Concurrent edits.** Optimistic locking (`version` column) returns `Conflict: StaleVersion`.
- **Empty states.** No locations, no packages, closed day or blackout (with the next available
  date), fully booked, and no bookings yet.
- **CSRF.** SameSite=Lax cookies plus an Origin check on mutating API calls.

### Backward compatibility

- Public endpoints are versioned under `/api/v1` (`Api-Version` response header). Changes there are
  additive only, and clients must treat unknown error `kind`s and booking `status`es generically.
  Breaking changes go to `/api/v2`.
- Migrations are expand/contract: add nullable → dual-write → backfill → drop in a later release.
- Packages are versioned rows (`code` + `version`), never edited in place, and bookings snapshot what was sold.

## Production checklist

- Replace dev login with a real provider: re-implement `src/server/auth/session.ts` (Auth.js, Clerk).
- Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and point a Stripe webhook at
  `/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`
  and `checkout.session.expired`.
- Swap `MemoryRateLimiter` for a Redis-backed implementation of the same port when running more than one instance.
- Schedule `POST /api/internal/cron/expire-holds` every minute with `Authorization: Bearer $CRON_SECRET`.
