import { PushError, type PushSender, type RateLimiter } from "@agenteschat/adapters";
import type { Database } from "@agenteschat/db";
import {
  authenticateRelayInstance,
  type RelayInstance,
  RelayRateLimitError,
  registerRelayInstance,
  relaySend,
  ValidationError,
} from "@agenteschat/engine";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestLimitIp } from "../http/client-ip";
import { apiError } from "../http/errors";
import type { Logger } from "../logger";

/** Registrations per address per hour, and in total per hour (an installation registers once). */
const REGISTER_PER_IP = { limit: 10, windowMs: 3600_000 };
const REGISTER_TOTAL = { limit: 1000, windowMs: 3600_000 };
/** 100 messages with their text and data fit well under this. */
const MAX_BODY_BYTES = 512 * 1024;

export interface PushRelayDeps {
  db: Database;
  /** The relay's own sender: Firebase with the Android app's service account, APNs with the iPhone app's key. */
  sender: PushSender;
  rateLimiter: RateLimiter;
  /** `TRUSTED_PROXIES`, so registrations are limited per real address. */
  trustedProxies?: readonly string[];
  log?: Logger;
}

type Vars = { Variables: { instance: RelayInstance } };

/**
 * The push relay's API (ADR 0152, ADR 0178), mounted at `/api/push-relay/v1` only when this server runs the relay
 * (`PUSH_RELAY_SERVE` with `FIREBASE_SERVICE_ACCOUNT` or `APNS_KEY`). Server to server, JSON only, no session or CSRF:
 * installations register on their own and then call with `Authorization: Bearer <instanceId>.<secret>`.
 * Errors use the API's error shape (`{ error: { code, message } }`); the client reads `blocked` and
 * `params.retryable` from it.
 */
export function pushRelayRoutes(deps: PushRelayDeps) {
  const app = new Hono<Vars>();
  const { db, sender, rateLimiter, trustedProxies, log } = deps;

  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => apiError(c, 413, "too_large", `The request is too large (max ${MAX_BODY_BYTES} bytes)`),
    }),
  );

  app.post("/instances", async (c) => {
    const ip = requestLimitIp(c.req.raw.headers, trustedProxies);
    // The address first: the total counts only what an address may ask, or one address could use it all up
    // (a limiter counts refused calls too) and keep every new installation out.
    const perIp = await rateLimiter.consume(`push-relay:register:${ip}`, REGISTER_PER_IP);
    if (!perIp.allowed) return limited(c, perIp.resetAt);
    const total = await rateLimiter.consume("push-relay:register", REGISTER_TOTAL);
    if (!total.allowed) return limited(c, total.resetAt);
    const body = await readJson(c);
    const version = body && typeof body.version === "string" ? body.version.slice(0, 40) : undefined;
    const created = await registerRelayInstance(db);
    log?.info("push relay: installation registered", { instanceId: created.instanceId, version });
    return c.json(created, 201);
  });

  // Every other path needs an installation's credentials.
  app.use("*", async (c, next) => {
    const who = await authenticateRelayInstance(db, c.req.header("authorization"));
    if (who === "unauthorized") return apiError(c, 401, "unauthorized", "Unknown installation or wrong secret");
    if (who === "blocked") return apiError(c, 403, "blocked", "This installation is blocked at the push relay");
    c.set("instance", who);
    await next();
  });

  app.post("/send", async (c) => {
    const body = await readJson(c);
    if (!body || !Array.isArray(body.messages)) return apiError(c, 400, "invalid_request", "messages: Required");
    const instance = c.get("instance");
    try {
      const results = await relaySend({ db, sender, rateLimiter }, instance, body.messages);
      log?.debug("push relay: sent", {
        instanceId: instance.id,
        messages: results.length,
        ok: results.filter((r) => r.ok).length,
      });
      return c.json({ results }, 200);
    } catch (error) {
      if (error instanceof ValidationError) return apiError(c, 400, error.code, error.message, error.params);
      if (error instanceof RelayRateLimitError) {
        log?.warn("push relay: installation over its limit", { instanceId: instance.id });
        return limited(c, error.resetAt);
      }
      if (error instanceof PushError) {
        // The sender's own failure, passed on: the installation's outbox retries when it may work later.
        log?.warn("push relay: sending failed", { instanceId: instance.id, status: error.status });
        return apiError(c, 502, "upstream_failed", error.message, { retryable: error.retryable });
      }
      throw error;
    }
  });

  app.notFound((c) => apiError(c, 404, "not_found", "Route not found"));
  app.onError((error, c) => {
    log?.error("push relay: unhandled error", { path: c.req.path, error: String(error) });
    return apiError(c, 500, "internal_error", "Something went wrong on our side", { retryable: true });
  });

  return app;
}

function limited(c: Context, resetAt: Date) {
  c.header("retry-after", String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))));
  return apiError(c, 429, "rate_limited", "Too many requests. Try again later", { retryable: true });
}

/** The JSON body as an object, or null (missing, not JSON, not an object). */
async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  const parsed = (await c.req.json().catch(() => null)) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}
