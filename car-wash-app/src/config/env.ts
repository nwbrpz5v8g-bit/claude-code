import "server-only";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    AUTH_DEV_LOGIN: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    APP_URL: z.string().url(),
    STRIPE_SECRET_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
    STRIPE_WEBHOOK_SECRET: z.string().optional().transform((v) => (v ? v : undefined)),
    CRON_SECRET: z.string().min(16),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_DEV_LOGIN) {
      ctx.addIssue({ code: "custom", path: ["AUTH_DEV_LOGIN"], message: "Dev login must be off in production" });
    }
    if (env.NODE_ENV === "production" && !env.STRIPE_SECRET_KEY) {
      ctx.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "Required in production" });
    }
    if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["STRIPE_WEBHOOK_SECRET"], message: "Set both Stripe keys or neither" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated lazily so `next build` does not need runtime secrets. Fails fast on first use. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  cached = parsed.data;
  return cached;
}
