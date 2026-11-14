import {
  APNS_APP_ID_MAX,
  APNS_PUSH_TOKEN,
  apnsAppIdValid,
  FCM_PUSH_TOKEN,
  PUSH_STALE_MAX,
  registerPushDevice,
  stalePushNotifications,
  unregisterPushDevice,
  vapidKeys,
} from "@agenteschat/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { deviceAccountsOf, sessionOf } from "../../auth";
import { apiError, errorResponse } from "../../http/errors";
import { type AppDeps, body, createAppRouter, errors, json, noContent, requireSession, security } from "./context";

const tags = ["Push"];

/** An iPhone's APNs device token (ADR 0178). */
const IosToken = z
  .string()
  .regex(APNS_PUSH_TOKEN, "must be an APNs device token")
  .openapi({ example: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0" });

/** An Android phone's FCM registration token (ADR 0152). */
const AndroidToken = z
  .string()
  .regex(FCM_PUSH_TOKEN, "must be an FCM registration token")
  .openapi({ example: "dXNlcl9mY21fdG9rZW4:APA91bHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" });

const Locale = z.string().trim().min(2).max(35).openapi({ description: "Device language, e.g. `pt-BR`." });

/** Base64url of `min`–`max` characters, with the padding some browsers add (dropped when stored). */
const base64url = (min: number, max: number) =>
  z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${min},${max}}={0,2}$`), "must be base64url");

const bytesOf = (s: string) => Buffer.from(s.replace(/=+$/, ""), "base64url");

/** The other accounts signed in on the same phone on this server, by id (ADR 0183): they keep the token too. */
const SharedWith = z.array(z.string().min(1).max(200)).max(8).optional();
const AndroidDevice = z.object({
  token: AndroidToken,
  platform: z.literal("android"),
  locale: Locale,
  sharedWith: SharedWith,
});
const IosDevice = z.object({
  token: IosToken,
  platform: z.literal("ios"),
  locale: Locale,
  appId: z
    .string()
    .max(APNS_APP_ID_MAX)
    .refine(apnsAppIdValid, "must be a bundle id")
    .optional()
    .openapi({ description: "The app's bundle id: where Apple delivers its pushes.", example: "chat.agentes.app" }),
  sandbox: z
    .boolean()
    .optional()
    .openapi({ description: "A development build, whose token belongs to Apple's sandbox." }),
  sharedWith: SharedWith,
});

/** A browser's Web Push subscription (ADR 0071), as `PushSubscription.toJSON()` gives it. */
const WebDevice = z.object({
  platform: z.literal("web"),
  endpoint: z
    .url()
    .max(2048)
    .refine((u) => u.startsWith("https://"), "must be an https URL")
    .openapi({ description: "The subscription's endpoint, at the browser's push service." }),
  keys: z.object({
    p256dh: base64url(80, 100).refine((k) => {
      const point = bytesOf(k);
      return point.length === 65 && point[0] === 0x04;
    }, "must be an uncompressed P-256 point"),
    auth: base64url(16, 30).refine((k) => bytesOf(k).length >= 16, "must be at least 16 bytes"),
  }),
  locale: Locale,
});

/**
 * Push devices (ADR 0035, ADR 0071, ADR 0152, ADR 0178): the phone app's tokens (Android's FCM token, the iPhone's
 * APNs token) and browsers' Web Push subscriptions.
 * Per person: one device hears every organization of its person.
 */
export function pushRoutes(deps: AppDeps) {
  const { db } = deps;
  const app = createAppRouter(deps);
  app.use("/push/*", requireSession(deps.auth));

  app.openapi(
    createRoute({
      method: "get",
      path: "/push/web",
      tags,
      security,
      summary: "This server's Web Push key",
      description:
        "The VAPID public key a browser subscribes with (`applicationServerKey`), base64url. 404 `web_push_off` when this server sends no browser push (`WEB_PUSH=off`).",
      responses: { 200: json(z.object({ publicKey: z.string() })), ...errors },
    }),
    async (c) => {
      if (!deps.adapters.webPush) return apiError(c, 404, "web_push_off", "This server sends no browser push");
      const wrappers = [deps.adapters.keyWrapper, ...deps.adapters.legacyKeyWrappers];
      const { publicKey } = await vapidKeys(db, wrappers, deps.config);
      return c.json({ publicKey }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/push/devices",
      tags,
      security,
      summary: "Register this phone or browser for push notifications",
      description:
        "Upsert by token (a browser's endpoint): registering again refreshes it, and one registered by someone else moves to you, unless they are signed in on the same device too (`sharedWith` from a phone, the browser's own accounts: ADR 0183), who keep theirs once the database keeps a token per account. Android phones send their FCM registration token, iPhones their APNs device token with their app's id; browsers their Web Push subscription, which then belongs to this session: signing out (everywhere too) or the session running out stops it. Call on every launch or page load after sign-in.",
      request: { body: body(z.union([AndroidDevice, IosDevice, WebDevice])) },
      responses: { 204: noContent[204], 429: errorResponse("Too many registrations"), ...errors },
    }),
    async (c) => {
      const user = c.get("user");
      const limit = await deps.adapters.rateLimiter.consume(`push:${user.id}`, { limit: 30, windowMs: 3600_000 });
      if (!limit.allowed) return apiError(c, 429, "rate_limited", "Too many registrations. Try again later.");
      const input = c.req.valid("json");
      if (input.platform !== "web") {
        await registerPushDevice(db, user.id, input);
        return c.body(null, 204);
      }
      // A browser hears pushes only while the session that turned them on lasts (ADR 0071).
      const session = await sessionOf(deps.auth, c.req.raw.headers);
      const sessionId = session?.session.id;
      // The browser's other accounts (ADR 0183), read from its own cookies: each keeps hearing its pushes here.
      const { accounts } = await deviceAccountsOf(deps.auth, c.req.raw.headers);
      const sharedWith = accounts.filter((a) => !a.current).map((a) => a.user.id);
      if (!sessionId || !(await registerPushDevice(db, user.id, { ...input, sessionId, sharedWith }))) {
        return apiError(c, 401, "unauthorized", "Sign in to continue");
      }
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/push/stale",
      tags,
      security,
      summary: "Which shown notifications to take down",
      description: `Of the notification ids this device shows, the ones that aren't open, unread and unsnoozed notifications of yours anymore (read, done or snoozed elsewhere, gone, or not yours), at most ${PUSH_STALE_MAX}. Pages ask when they come back to the foreground (ADR 0071).`,
      request: { body: body(z.object({ ids: z.array(z.uuid()).max(PUSH_STALE_MAX) })) },
      responses: {
        200: json(z.object({ stale: z.array(z.string()) })),
        429: errorResponse("Too many requests"),
        ...errors,
      },
    }),
    async (c) => {
      const user = c.get("user");
      const limit = await deps.adapters.rateLimiter.consume(`push-stale:${user.id}`, {
        limit: 600,
        windowMs: 3600_000,
      });
      if (!limit.allowed) return apiError(c, 429, "rate_limited", "Too many requests. Try again later.");
      const stale = await stalePushNotifications(db, user.id, c.req.valid("json").ids);
      return c.json({ stale }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/push/devices/forget",
      tags,
      security,
      summary: "Stop push notifications on this browser or phone",
      description:
        "Only your own devices; anything else is a no-op. The token (a browser's endpoint, a phone's push token) goes in the body: an endpoint is a URL, and its encoded slashes in a path don't survive every proxy.",
      request: { body: body(z.object({ token: z.string().min(1).max(2048) })) },
      responses: { 204: noContent[204], ...errors },
    }),
    async (c) => {
      await unregisterPushDevice(db, c.get("user").id, c.req.valid("json").token);
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/push/devices/{token}",
      tags,
      security,
      summary: "Stop push notifications on this phone (sign-out)",
      description:
        "Only your own tokens; anything else is a no-op. URL-encode the token. A browser's endpoint goes to `POST /push/devices/forget` instead.",
      request: { params: z.object({ token: z.string().min(1).max(2048) }) },
      responses: { 204: noContent[204], ...errors },
    }),
    async (c) => {
      await unregisterPushDevice(db, c.get("user").id, c.req.valid("param").token);
      return c.body(null, 204);
    },
  );

  return app;
}
