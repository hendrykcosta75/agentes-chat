import { type ClientHttp2Session, connect, constants } from "node:http2";
import type { PushMessage, PushResult, PushSender } from "./push";
import { pemToDer } from "./push-fcm";
import { base64url, mapLimit } from "./push-util";

/**
 * iPhone pushes straight to Apple's APNs (ADR 0178): HTTP/2, one connection per host kept open and reused,
 * authenticated with a provider token (a JWT signed with the team's .p8 key, ES256). Apple takes a token up
 * to an hour old and refuses one made again more often than every 20 minutes, so it is kept 50. Message text
 * is never logged.
 *
 * The app shows notifications with expo-notifications, which reads a push's deep link data from the
 * payload's `body` key (`apnsRequest`); nothing else runs between APNs and the app.
 */

/** The team's APNs auth key (`APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`). */
export interface ApnsKey {
  /** The .p8 file: PKCS #8 PEM of a P-256 key. */
  key: string;
  keyId: string;
  teamId: string;
}

export const APNS_ORIGIN = "https://api.push.apple.com";
export const APNS_SANDBOX_ORIGIN = "https://api.sandbox.push.apple.com";
/** How long APNs keeps a push for a phone that is away. */
export const APNS_TTL_SECONDS = 86_400;
/** A provider token is used this long, then made again. */
export const APNS_TOKEN_TTL_MS = 50 * 60_000;
/** Apple refuses a token made again more often than this: a refused one is replaced at most this often. */
const FORCED_REFRESH_EVERY_MS = 20 * 60_000;
/** Requests in flight at once (one request per message, all on one connection). */
export const APNS_CONCURRENCY = 10;
/**
 * An APNs device token as the iPhone app gets it from `getDevicePushTokenAsync` (ADR 0178): hex, 32 bytes
 * today (Apple says they may grow). The push relay refuses anything else, and its client never sends it one.
 */
export const APNS_PUSH_TOKEN = /^[0-9a-fA-F]{64,200}$/;
/** An iPhone app's id: its bundle id (reverse DNS), which is its APNs topic. */
export const APNS_APP_ID = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+){1,10}$/;
export const APNS_APP_ID_MAX = 155;
/** A notification category's id (`aps.category`), as the app registers its own (a notification's kind). */
export const APNS_CATEGORY = /^[A-Za-z0-9._-]{1,64}$/;

/** Whether `id` can be a bundle id. */
export const apnsAppIdValid = (id: string) => id.length <= APNS_APP_ID_MAX && APNS_APP_ID.test(id);

/**
 * One message's APNs request: its headers and JSON body. An alert with the title, the text and the default
 * sound; the deep link data under `body`, where expo-notifications reads a notification's data; `category`
 * names the buttons the app registered for it. Always priority 10: Apple delivers 5 when it suits the phone's
 * battery, which may be minutes later, and every push here is something a person is told about. A day's
 * expiration, so a phone that was away still gets it.
 */
export function apnsRequest(m: PushMessage, topic: string, now = Date.now()) {
  return {
    headers: {
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(now / 1000) + APNS_TTL_SECONDS),
      "content-type": "application/json",
    } as Record<string, string>,
    body: {
      aps: {
        alert: { title: m.title, body: m.body },
        sound: "default",
        ...(m.category ? { category: m.category } : {}),
      },
      body: m.data,
    },
  };
}

/** One HTTP/2 POST and its answer: the seam tests replace (no network). */
export interface Http2Client {
  request(
    origin: string,
    request: { path: string; headers: Record<string, string>; body: string; timeoutMs: number },
  ): Promise<{ status: number; body: string }>;
  close(): void;
}

/**
 * `node:http2` with one session per origin, reused by every request and opened again after the server
 * sends GOAWAY, the session fails or it closes. A session nothing used for `idleMs` is closed.
 */
export function createNodeHttp2Client(options: { idleMs?: number } = {}): Http2Client {
  const idleMs = options.idleMs ?? 10 * 60_000;
  const sessions = new Map<string, { session: ClientHttp2Session; idle: ReturnType<typeof setTimeout> | null }>();

  function drop(origin: string, session: ClientHttp2Session) {
    const open = sessions.get(origin);
    if (open?.session !== session) return;
    if (open.idle) clearTimeout(open.idle);
    sessions.delete(origin);
  }

  function sessionOf(origin: string): ClientHttp2Session {
    let open = sessions.get(origin);
    if (!open || open.session.closed || open.session.destroyed) {
      const fresh = connect(origin);
      // Draining: streams already open finish, new requests get a new session.
      fresh.on("goaway", () => {
        drop(origin, fresh);
        fresh.close();
      });
      // Without a listener an error would end the process; the streams on it fail on their own.
      fresh.on("error", () => drop(origin, fresh));
      fresh.on("close", () => drop(origin, fresh));
      open = { session: fresh, idle: null };
      sessions.set(origin, open);
    }
    const { session } = open;
    if (open.idle) clearTimeout(open.idle);
    open.idle = setTimeout(() => {
      drop(origin, session);
      session.close();
    }, idleMs);
    // An idle connection must not keep the process from ending.
    open.idle.unref?.();
    return session;
  }

  return {
    request(origin, request) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let stream: ReturnType<ClientHttp2Session["request"]> | undefined;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn();
        };
        const timer = setTimeout(() => {
          settle(() => reject(new Error(`no answer in ${request.timeoutMs} ms`)));
          stream?.close(constants.NGHTTP2_CANCEL);
        }, request.timeoutMs);
        try {
          stream = sessionOf(origin).request({ ":method": "POST", ":path": request.path, ...request.headers });
        } catch (error) {
          settle(() => reject(error));
          return;
        }
        let status = 0;
        const chunks: Buffer[] = [];
        stream.on("response", (headers) => {
          status = Number(headers[":status"] ?? 0);
        });
        stream.on("data", (chunk: Buffer | string) => {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        });
        stream.on("end", () => settle(() => resolve({ status, body: Buffer.concat(chunks).toString("utf8") })));
        stream.on("error", (error) => settle(() => reject(error)));
        stream.on("close", () => settle(() => reject(new Error("the stream closed without an answer"))));
        stream.end(request.body);
      });
    },
    close() {
      for (const [origin, open] of sessions) {
        drop(origin, open.session);
        open.session.close();
      }
    },
  };
}

/** The provider token: `{ alg: ES256, kid }.{ iss: team, iat }`, signed with the .p8 key. */
export async function apnsProviderToken(key: ApnsKey, signingKey: CryptoKey, now = Date.now()): Promise<string> {
  const input = `${base64url(JSON.stringify({ alg: "ES256", kid: key.keyId }))}.${base64url(
    JSON.stringify({ iss: key.teamId, iat: Math.floor(now / 1000) }),
  )}`;
  // WebCrypto's ECDSA signature is already JWS's form (r ‖ s, 64 bytes).
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

/** Apple's reasons that mean our provider token, not the device, is wrong. */
const PROVIDER_TOKEN_REASONS = new Set(["InvalidProviderToken", "ExpiredProviderToken"]);
/** Apple's reasons that mean the token never reaches this app on a device again. */
const GONE_REASONS = new Set(["Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic"]);

function reasonOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason.slice(0, 80) : "";
  } catch {
    return "";
  }
}

/** What APNs' answer to one message means for its token. */
export function apnsResultOf(token: string, status: number, body: string): PushResult {
  if (status === 200) return { token, ok: true, unregistered: false };
  const reason = reasonOf(body);
  const error = `APNs answered ${status}${reason ? ` ${reason}` : ""}`;
  // Uninstalled (410), no token of this environment, or a token of another app: never reachable as registered.
  if (status === 410 || GONE_REASONS.has(reason)) return { token, ok: false, unregistered: true, error };
  if (status === 429 || status >= 500) return { token, ok: false, unregistered: false, retryable: true, error };
  return { token, ok: false, unregistered: false, retryable: false, error };
}

const failed = (token: string, retryable: boolean, error: string): PushResult => ({
  token,
  ok: false,
  unregistered: false,
  retryable,
  error,
});

/**
 * The iPhones' `PushSender`. Answers every message (never throws): sent, unregistered (410, `Unregistered`,
 * `BadDeviceToken`, `DeviceTokenNotForTopic`, a token that isn't hex), retryable (429, 5xx, the network) or
 * a final failure (a key Apple refuses, an app that isn't one of `appIds`, other 4xx).
 *
 * `appIds` are the apps this key pushes to (`APNS_APP_IDS`): a message naming another is refused before it
 * leaves, since one key signs for every app of its team; one naming none goes to the first. A token belongs
 * to one of Apple's two environments, and the app says which when it registers; one Apple calls
 * `BadDeviceToken` there is tried once on the other, so a build that told it wrong still gets its push.
 * The provider token is shared by every send; one Apple refuses is made again once, at most every 20 minutes.
 */
export function createApnsPushSender(options: {
  key: ApnsKey;
  appIds: readonly string[];
  http2?: Http2Client;
  timeoutMs?: number;
  now?: () => number;
}): PushSender & { close(): void } {
  const { key, appIds } = options;
  const http2 = options.http2 ?? createNodeHttp2Client();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? Date.now;
  let signingKey: Promise<CryptoKey> | null = null;
  let cached: { token: string; madeAt: number } | null = null;
  let making: Promise<string> | null = null;
  let forcedAt = Number.NEGATIVE_INFINITY;

  function importKey(): Promise<CryptoKey> {
    if (!signingKey) {
      const algorithm = { name: "ECDSA", namedCurve: "P-256" };
      const imported = crypto.subtle.importKey("pkcs8", pemToDer(key.key), algorithm, false, ["sign"]);
      imported.catch(() => {
        if (signingKey === imported) signingKey = null;
      });
      signingKey = imported;
    }
    return signingKey;
  }

  function providerToken(): Promise<string> {
    if (cached && now() - cached.madeAt < APNS_TOKEN_TTL_MS) return Promise.resolve(cached.token);
    making ??= (async () => {
      const madeAt = now();
      const token = await apnsProviderToken(key, await importKey(), madeAt);
      cached = { token, madeAt };
      return token;
    })().finally(() => {
      making = null;
    });
    return making;
  }

  function post(message: PushMessage, topic: string, sandbox: boolean, token: string) {
    const { headers, body } = apnsRequest(message, topic, now());
    return http2.request(sandbox ? APNS_SANDBOX_ORIGIN : APNS_ORIGIN, {
      path: `/3/device/${message.to}`,
      headers: { authorization: `bearer ${token}`, ...headers },
      body: JSON.stringify(body),
      timeoutMs,
    });
  }

  const refusedToken = (answer: { status: number; body: string }) =>
    answer.status === 403 && PROVIDER_TOKEN_REASONS.has(reasonOf(answer.body));

  async function sendOne(message: PushMessage): Promise<PushResult> {
    const to = message.to;
    if (!APNS_PUSH_TOKEN.test(to))
      return { token: to, ok: false, unregistered: true, error: "not an APNs device token" };
    const topic = message.apns?.topic ?? appIds[0];
    if (!topic || !appIds.includes(topic)) {
      return failed(to, false, `the app ${topic ?? "(none)"} is not one this server pushes to (APNS_APP_IDS)`);
    }
    const sandbox = message.apns?.sandbox === true;
    let token: string;
    try {
      token = await providerToken();
    } catch (error) {
      return failed(to, false, `the APNs key can't sign: ${String(error)}`);
    }
    try {
      let answer = await post(message, topic, sandbox, token);
      if (refusedToken(answer)) {
        const refusal = `APNs refused our provider token (${reasonOf(answer.body)}): check APNS_KEY, APNS_KEY_ID and APNS_TEAM_ID`;
        // One new token, at most every 20 minutes; refused again, the key or its ids are wrong.
        if (cached?.token === token) {
          if (now() - forcedAt < FORCED_REFRESH_EVERY_MS) return failed(to, false, refusal);
          cached = null;
          forcedAt = now();
        }
        token = await providerToken();
        answer = await post(message, topic, sandbox, token);
        if (refusedToken(answer)) return failed(to, false, refusal);
      }
      if (answer.status === 400 && reasonOf(answer.body) === "BadDeviceToken") {
        // A token of the other environment answers this way: tried there once before it counts as gone.
        const other = await post(message, topic, !sandbox, token).catch(() => null);
        if (other?.status === 200) return { token: to, ok: true, unregistered: false };
      }
      return apnsResultOf(to, answer.status, answer.body);
    } catch (error) {
      return failed(to, true, `could not reach APNs: ${String(error)}`);
    }
  }

  return {
    id: "apns",
    send: (messages) => mapLimit(messages, APNS_CONCURRENCY, sendOne),
    close: () => http2.close(),
  };
}
