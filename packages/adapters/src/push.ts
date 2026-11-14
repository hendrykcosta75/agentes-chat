/**
 * Push notifications to the phone app (ADR 0035, ADR 0152, ADR 0178). Core sends only from an
 * outbox job (`push.send`), never inline in a request. Android phones are reached
 * straight through Firebase Cloud Messaging (`push-fcm.ts`, the app registers its
 * FCM token), iPhones straight through Apple's APNs (`push-apns.ts`, the app registers
 * its APNs device token); a server without those credentials sends through the push
 * relay (`push-relay.ts`). `createPhonePushSender` sends each message to its platform's
 * sender. Tests use the fake.
 */
export type PushPlatform = "ios" | "android";

export interface PushMessage {
  /** The phone's token: FCM registration token (Android) or APNs device token (hex, iOS). */
  to: string;
  platform: PushPlatform;
  title: string;
  body: string;
  /** Deep link data for the app (`{ orgId, kind, notificationId, … }`). */
  data: Record<string, unknown>;
  /** `high` wakes the device right away (things waiting for the person). */
  priority?: "default" | "high";
  /** The app's notification category (iOS `aps.category`): the buttons it shows on the lock screen. */
  category?: string;
  /**
   * iOS: the app the token belongs to (its bundle id, the APNs topic) and whether it is a development build,
   * whose tokens are the APNs sandbox's (ADR 0178). No topic: the sender's first app.
   */
  apns?: { topic?: string; sandbox?: boolean };
}

export interface PushResult {
  token: string;
  ok: boolean;
  /** The token no longer reaches a device (app uninstalled, notifications off): delete it. */
  unregistered: boolean;
  /** Not taken now, but may be later (rate limited, the service unavailable): the outbox may try again. */
  retryable?: boolean;
  /**
   * Not sent because this server sends nothing to the phone's platform (`PUSH_SENDER=off`, or `direct` without
   * that platform's credentials): not a failure, and the device stays for when it does.
   */
  skipped?: boolean;
  error?: string;
}

export interface PushSender {
  readonly id: string;
  /** One result per message, in order. Throws `PushError` when the whole request failed. */
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

/** A request failure; `retryable` drives the outbox retry. */
export class PushError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PushError";
  }
}

/** Whether a sender's failure may work later: a `PushError` says so; anything else (the network, a store) may. */
const mayRetry = (error: unknown) => (error as { retryable?: unknown } | null)?.retryable !== false;

/**
 * The phone sender the server uses: each message goes to its platform's sender, in one `send` per
 * platform (both at once), and the results come back in the messages' order. A platform with no sender
 * answers its messages as `skipped`: neither sent, failed nor unregistered, so the device stays for when the
 * server sends there.
 *
 * One sender failing as a whole (a `PushError`) never keeps the other platform's phones from their push. When
 * no phone took it, that error is thrown (a retryable one first) as a single sender's would be, so the outbox
 * decides; when some did, the failed platform's phones answer it as their own failure instead, since a retry
 * would push the others twice.
 */
export function createPhonePushSender(senders: { android?: PushSender | null; ios?: PushSender | null }): PushSender {
  const of = (platform: PushPlatform) => senders[platform] ?? null;
  return {
    id: "phones",
    async send(messages) {
      const out = new Array<PushResult>(messages.length);
      const thrown: { at: number[]; error: unknown }[] = [];
      await Promise.all(
        (["android", "ios"] as const).map(async (platform) => {
          const at = messages.flatMap((m, i) => (m.platform === platform ? [i] : []));
          if (at.length === 0) return;
          const sender = of(platform);
          if (!sender) {
            for (const i of at) {
              out[i] = {
                token: messages[i]?.to ?? "",
                ok: false,
                unregistered: false,
                skipped: true,
                error: `this server sends no ${platform} push`,
              };
            }
            return;
          }
          try {
            const results = await sender.send(at.map((i) => messages[i] as PushMessage));
            at.forEach((i, n) => {
              out[i] = results[n] ?? {
                token: messages[i]?.to ?? "",
                ok: false,
                unregistered: false,
                error: "no result",
              };
            });
          } catch (error) {
            thrown.push({ at, error });
          }
        }),
      );
      const first = thrown.find((t) => mayRetry(t.error)) ?? thrown[0];
      if (first && !out.some((r) => r?.ok)) throw first.error;
      for (const { at, error } of thrown) {
        for (const i of at) {
          out[i] = {
            token: messages[i]?.to ?? "",
            ok: false,
            unregistered: false,
            retryable: mayRetry(error),
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      return out;
    },
  };
}

/**
 * Test sender: records every message, never sends. Tokens in `unregistered`
 * come back unregistered at once; tokens in `failing` as a failure that can be
 * retried (as FCM's and APNs' 429 and 5xx).
 */
export function createFakePushSender(options: { unregistered?: Iterable<string>; failing?: Iterable<string> } = {}) {
  const sent: PushMessage[] = [];
  const unregistered = new Set(options.unregistered ?? []);
  const failing = new Set(options.failing ?? []);
  const sender: PushSender & { sent: PushMessage[]; unregistered: Set<string>; failing: Set<string> } = {
    id: "fake",
    sent,
    unregistered,
    failing,
    async send(messages) {
      return messages.map((m): PushResult => {
        if (unregistered.has(m.to)) return { token: m.to, ok: false, unregistered: true, error: "DeviceNotRegistered" };
        if (failing.has(m.to))
          return { token: m.to, ok: false, unregistered: false, retryable: true, error: "unavailable" };
        sent.push(m);
        return { token: m.to, ok: true, unregistered: false };
      });
    },
  };
  return sender;
}
