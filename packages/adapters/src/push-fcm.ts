import type { PushMessage, PushResult, PushSender } from "./push";
import { base64url, mapLimit } from "./push-util";

/**
 * Android pushes straight through Firebase Cloud Messaging's HTTP v1 API (ADR 0152), with a service
 * account of the Firebase project the app is built with (`FIREBASE_SERVICE_ACCOUNT`). The account signs a
 * JWT (RS256), Google's token endpoint trades it for an access token (an hour), and each message is one
 * `messages:send` request. Message text is never logged.
 *
 * The app shows notifications with expo-notifications, whose own Firebase messaging service presents a
 * data message laid out as below (`fcmMessage`); nothing else runs between FCM and the app.
 */

/** The fields of a service account JSON this sender uses. */
export interface FcmServiceAccount {
  projectId: string;
  clientEmail: string;
  /** PKCS #8 PEM (`-----BEGIN PRIVATE KEY-----`). */
  privateKey: string;
  /** Default: Google's token endpoint. */
  tokenUri?: string;
}

export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FCM_URL = "https://fcm.googleapis.com";
/** How long FCM keeps a push for a phone that is away. */
export const FCM_TTL_SECONDS = 86_400;
/** The Android notification channel the app creates for its notifications (`ensureAndroidChannel`). */
export const FCM_ANDROID_CHANNEL = "default";
/**
 * An FCM registration token as the Android app gets it from `getDevicePushTokenAsync` (ADR 0152): opaque,
 * about 150 to 200 characters of base64url and colons. Capped well under what a unique index takes. The
 * push relay refuses anything else, and its client never sends it one.
 */
export const FCM_PUSH_TOKEN = /^[A-Za-z0-9_:-]{32,2048}$/;
/** Requests in flight at once (one request per message). */
export const FCM_CONCURRENCY = 10;
/** An access token is refreshed this long before it expires. */
const REFRESH_BEFORE_MS = 5 * 60_000;

/**
 * The FCM HTTP v1 request body of one message. Always a data message (no `notification` block), so
 * expo-notifications' messaging service gets it whether the app is open, in the background or closed: it
 * presents `title` and `message` on the `channelId` channel and hands `body` (the data, as JSON) to the app
 * as the notification's data. `high` wakes the phone right away; otherwise FCM's normal priority, which
 * may wait for a good moment. No `collapse_key`: FCM keeps only four of them per phone, so a phone that was
 * away would lose pushes.
 */
export function fcmMessage(m: PushMessage) {
  return {
    message: {
      token: m.to,
      android: { priority: m.priority === "high" ? "HIGH" : "NORMAL", ttl: `${FCM_TTL_SECONDS}s` },
      data: {
        title: m.title,
        message: m.body,
        body: JSON.stringify(m.data),
        channelId: FCM_ANDROID_CHANNEL,
        sound: "default",
      },
    },
  };
}

type FcmErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: { "@type"?: string; errorCode?: string; fieldViolations?: { field?: string }[] }[];
  };
};

/** What FCM's answer to one message means for its token. */
export function fcmResultOf(token: string, status: number, payload: FcmErrorBody): PushResult {
  if (status >= 200 && status < 300) return { token, ok: true, unregistered: false };
  const details = payload.error?.details ?? [];
  const code = details.find((d) => d.errorCode)?.errorCode ?? payload.error?.status ?? "";
  const message = payload.error?.message ?? "";
  const error = `FCM answered ${status}${code ? ` ${code}` : ""}${message ? `: ${message.slice(0, 200)}` : ""}`;
  // Uninstalled, or a token of another Firebase project (a build of another app): never reachable with ours.
  // FCM says which (`UNREGISTERED` comes with its 404); a bare 404 is about the request (a project id that
  // isn't one), and taking it for the token would delete every Android phone.
  if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH") return { token, ok: false, unregistered: true, error };
  const aboutToken =
    details.some((d) => d.fieldViolations?.some((v) => v.field === "message.token")) ||
    /registration token/i.test(message);
  if (status === 400 && aboutToken) return { token, ok: false, unregistered: true, error };
  if (status === 429 || status >= 500) return { token, ok: false, unregistered: false, retryable: true, error };
  return { token, ok: false, unregistered: false, retryable: false, error };
}

/** The DER bytes of a PEM private key (`-----BEGIN PRIVATE KEY-----`, PKCS #8). */
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END)[^-]*-----/g, "")
    .replace(/\s+/g, "");
  const der = Buffer.from(b64, "base64");
  if (der.length === 0) throw new Error("not a PEM key");
  const out = new Uint8Array(new ArrayBuffer(der.length));
  out.set(der);
  return out;
}

/** The service account's signed JWT asking for an FCM access token (RFC 7523). */
export async function fcmAssertion(account: FcmServiceAccount, key: CryptoKey, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const input = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: account.tokenUri ?? GOOGLE_TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  )}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

class FcmAuthError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FcmAuthError";
  }
}

const failed = (token: string, retryable: boolean, error: string): PushResult => ({
  token,
  ok: false,
  unregistered: false,
  retryable,
  error,
});

/**
 * Android's `PushSender`. Answers every message (never throws): sent, unregistered (`UNREGISTERED`,
 * `SENDER_ID_MISMATCH`, a malformed token), retryable (429, 5xx, the network, Google's token endpoint
 * unavailable) or a final failure (a key Google refuses, other 4xx). The access token is shared by every
 * send until five minutes before it expires; a 401 gets one new token and one more try.
 */
export function createFcmPushSender(options: {
  serviceAccount: FcmServiceAccount;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}): PushSender {
  const http = options.fetch ?? fetch;
  const account = options.serviceAccount;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? Date.now;
  const url = `${FCM_URL}/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`;
  let signingKey: Promise<CryptoKey> | null = null;
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  function key(): Promise<CryptoKey> {
    if (!signingKey) {
      const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      const imported = crypto.subtle.importKey("pkcs8", pemToDer(account.privateKey), algorithm, false, ["sign"]);
      imported.catch(() => {
        if (signingKey === imported) signingKey = null;
      });
      signingKey = imported;
    }
    return signingKey;
  }

  /** A valid access token, fetched once for every send waiting on it. Throws `FcmAuthError`. */
  function accessToken(): Promise<string> {
    if (cached && cached.expiresAt - REFRESH_BEFORE_MS > now()) return Promise.resolve(cached.token);
    pending ??= (async () => {
      let assertion: string;
      try {
        assertion = await fcmAssertion(account, await key(), now());
      } catch (error) {
        throw new FcmAuthError(`the Firebase service account's key can't sign: ${String(error)}`, false);
      }
      let res: Response;
      try {
        res = await http(account.tokenUri ?? GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new FcmAuthError(`could not reach Google's token endpoint: ${String(error)}`, true);
      }
      const payload = (await res.json().catch(() => ({}))) as {
        access_token?: unknown;
        expires_in?: unknown;
        error?: unknown;
      };
      if (!res.ok || typeof payload.access_token !== "string") {
        const why = typeof payload.error === "string" ? `: ${payload.error}` : "";
        throw new FcmAuthError(
          `Google refused the Firebase service account (${res.status})${why}`,
          res.status === 429 || res.status >= 500,
        );
      }
      const seconds = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
      cached = { token: payload.access_token, expiresAt: now() + seconds * 1000 };
      return payload.access_token;
    })().finally(() => {
      pending = null;
    });
    return pending;
  }

  async function post(message: PushMessage, token: string) {
    const res = await http(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(fcmMessage(message)),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Read either way: an unread body keeps its connection from being reused (FCM answers the message's name).
    const payload = (await res.json().catch(() => ({}))) as FcmErrorBody;
    return { status: res.status, payload: res.ok ? {} : payload };
  }

  async function sendOne(message: PushMessage): Promise<PushResult> {
    const to = message.to;
    try {
      let token = await accessToken();
      let answer = await post(message, token);
      if (answer.status === 401) {
        // Expired or revoked early: one new token, one more try.
        if (cached?.token === token) cached = null;
        token = await accessToken();
        answer = await post(message, token);
        if (answer.status === 401) return failed(to, false, "FCM refused our access token (401)");
      }
      return fcmResultOf(to, answer.status, answer.payload);
    } catch (error) {
      if (error instanceof FcmAuthError) return failed(to, error.retryable, error.message);
      return failed(to, true, `could not reach FCM: ${String(error)}`);
    }
  }

  return {
    id: "fcm",
    send: (messages) => mapLimit(messages, FCM_CONCURRENCY, sendOne),
  };
}
