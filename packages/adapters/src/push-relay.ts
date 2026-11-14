import { PushError, type PushMessage, type PushResult, type PushSender } from "./push";
import { APNS_PUSH_TOKEN } from "./push-apns";
import { FCM_PUSH_TOKEN } from "./push-fcm";

/**
 * Phone pushes through the push relay (ADR 0152, ADR 0178). The phone app is one app in the stores, built
 * with agentes.chat's Firebase project and signed by its Apple team, whose service account and APNs key a
 * self-hosted server doesn't have. So the server sends through a relay that holds them: it registers itself
 * on first use (no account, nothing to configure), keeps the credentials the relay gave it, and sends the
 * messages it would send to Firebase or to Apple.
 */

/** Where an installation keeps what the relay gave it (the engine stores it sealed in the database). */
export interface RelayCredentials {
  get(): Promise<{ instanceId: string; secret: string } | null>;
  save(credentials: { instanceId: string; secret: string }): Promise<void>;
  clear(): Promise<void>;
}

/** The relay takes at most this many messages per request. */
export const PUSH_RELAY_BATCH = 100;

type RelayErrorBody = { error?: { code?: string; message?: string; params?: { retryable?: unknown } } };
type RegisterBody = RelayErrorBody & { instanceId?: unknown; secret?: unknown };

/**
 * A `PushSender` that sends through the relay at `url` (its base, e.g. `https://…/api/push-relay/v1`).
 * Registers lazily (`POST {url}/instances`) and saves the credentials. A 401 means the relay no longer
 * knows this installation: the server registers again once and retries once. A 403 `blocked` never
 * retries; a 429 or a relay failure does (the outbox retries). Message text is never logged.
 */
export function createRelayPushSender(options: {
  url: string;
  credentials: RelayCredentials;
  fetch?: typeof fetch;
  version?: string;
  timeoutMs?: number;
}): PushSender {
  const http = options.fetch ?? fetch;
  const base = options.url.replace(/\/+$/, "");
  const userAgent = `agentes.chat/${options.version ?? "dev"}`;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let registering: Promise<{ instanceId: string; secret: string }> | null = null;

  /** One registration at a time: concurrent sends on a fresh installation share it. */
  function register(): Promise<{ instanceId: string; secret: string }> {
    if (registering) return registering;
    const pending = (async () => {
      let res: Response;
      try {
        res = await http(`${base}/instances`, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json", "user-agent": userAgent },
          body: JSON.stringify(options.version ? { version: options.version } : {}),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new PushError(`could not reach the push relay: ${String(error)}`, true);
      }
      const payload = (await res.json().catch(() => ({}))) as RegisterBody;
      if (!res.ok) throw failure("push relay refused the registration", res.status, payload);
      if (typeof payload.instanceId !== "string" || typeof payload.secret !== "string") {
        throw new PushError("push relay answered the registration without credentials", true, res.status);
      }
      const credentials = { instanceId: payload.instanceId, secret: payload.secret };
      await options.credentials.save(credentials);
      return credentials;
    })().finally(() => {
      registering = null;
    });
    registering = pending;
    return pending;
  }

  async function current() {
    return (await options.credentials.get()) ?? (await register());
  }

  /** POSTs `body` to `path` with the installation's credentials; on 401, registers again once. */
  async function call(path: string, body: unknown): Promise<unknown> {
    let credentials = await current();
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await http(`${base}${path}`, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "user-agent": userAgent,
            authorization: `Bearer ${credentials.instanceId}.${credentials.secret}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new PushError(`could not reach the push relay: ${String(error)}`, true);
      }
      const payload = (await res.json().catch(() => ({}))) as RelayErrorBody;
      if (res.status === 401 && attempt === 0) {
        // Another send may have registered again already: use its credentials rather than clearing them.
        const stored = await options.credentials.get();
        if (stored && stored.instanceId !== credentials.instanceId) credentials = stored;
        else {
          await options.credentials.clear();
          credentials = await register();
        }
        continue;
      }
      if (!res.ok) throw failure("push relay refused the request", res.status, payload);
      return payload;
    }
  }

  return {
    id: "relay",
    async send(messages: PushMessage[]) {
      const results = new Array<PushResult>(messages.length);
      // The relay refuses a whole request over one token that can't be its platform's (an Expo token an older
      // build registered): such a token never reaches a phone through it, so it answers as gone here.
      const sendable: number[] = [];
      messages.forEach((m, i) => {
        const ios = m.platform === "ios";
        if ((ios ? APNS_PUSH_TOKEN : FCM_PUSH_TOKEN).test(m.to)) sendable.push(i);
        else {
          const error = ios ? "not an APNs device token" : "not an FCM registration token";
          results[i] = { token: m.to, ok: false, unregistered: true, error };
        }
      });
      for (let i = 0; i < sendable.length; i += PUSH_RELAY_BATCH) {
        const at = sendable.slice(i, i + PUSH_RELAY_BATCH);
        const batch = at.map((n) => messages[n] as PushMessage);
        const payload = (await call("/send", { messages: batch.map(relayMessageOf) })) as { results?: unknown };
        const got = Array.isArray(payload.results) ? (payload.results as Partial<PushResult>[]) : null;
        if (!got || got.length !== batch.length) {
          throw new PushError("push relay answered with the wrong number of results", true);
        }
        batch.forEach((m, n) => {
          const r = got[n] ?? {};
          results[at[n] as number] =
            r.ok === true
              ? { token: m.to, ok: true, unregistered: false }
              : r.skipped === true
                ? // The relay sends nothing to this platform: the device stays, as with no sender here.
                  { token: m.to, ok: false, unregistered: false, skipped: true, error: "the push relay sends none" }
                : {
                    token: m.to,
                    ok: false,
                    unregistered: r.unregistered === true,
                    ...(r.unregistered === true ? {} : { retryable: r.retryable === true }),
                    error: typeof r.error === "string" ? r.error : "error",
                  };
        });
      }
      return results;
    },
  };
}

/** A message as the relay takes it. */
function relayMessageOf(m: PushMessage) {
  return {
    to: m.to,
    platform: m.platform,
    title: m.title,
    body: m.body,
    data: m.data,
    ...(m.priority ? { priority: m.priority } : {}),
    // An iPhone's app and environment, and the buttons its notification shows (ADR 0178).
    ...(m.platform === "ios" && m.apns ? { apns: m.apns } : {}),
    ...(m.platform === "ios" && m.category ? { category: m.category } : {}),
  };
}

/**
 * A refused request as a `PushError`. Blocked installations and bad requests don't retry; rate limits
 * and server errors do, unless the relay says otherwise.
 */
function failure(what: string, status: number, payload: RelayErrorBody): PushError {
  const code = payload.error?.code;
  const message = payload.error?.message;
  if (status === 403 && code === "blocked") {
    return new PushError(
      "this installation is blocked at the push relay: phone notifications are off until its operator lifts it",
      false,
      status,
    );
  }
  const hint = payload.error?.params?.retryable;
  const retryable = typeof hint === "boolean" ? hint : status === 429 || status >= 500;
  return new PushError(`${what} (${status})${message ? `: ${message}` : code ? `: ${code}` : ""}`, retryable, status);
}
