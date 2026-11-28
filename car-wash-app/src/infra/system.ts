import type { Clock, Logger } from "@/application/ports/system";

export const systemClock: Clock = { now: () => new Date() };

/** Structured JSON logs. Never pass secrets, tokens or full request bodies in `ctx`. */
export const jsonLogger: Logger = {
  info: (msg, ctx) => console.log(JSON.stringify({ level: "info", msg, ...ctx })),
  warn: (msg, ctx) => console.warn(JSON.stringify({ level: "warn", msg, ...ctx })),
  error: (msg, ctx) => console.error(JSON.stringify({ level: "error", msg, ...ctx })),
};
