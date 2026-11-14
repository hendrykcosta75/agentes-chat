/**
 * What a push carries for the deep link (ADR 0035 §4; the server's `PUSH_PLACE_KEYS` in packages/engine/src/push.ts):
 * `{ orgId, kind, notificationId }` and the ids of where it happened. Pure: reads untrusted notification data into
 * known string fields (anything else is dropped), so the route mapping (`hrefForPush`) gets clean input.
 */
export type PushData = Partial<Record<(typeof FIELDS)[number], string>>;

const FIELDS = [
  // The server it came from (ADR 0154): a phone signed in to several opens it there.
  "server",
  // Whose it is (ADR 0183): a phone signed in to that server with several accounts opens it as theirs.
  "user",
  "orgId",
  "kind",
  "notificationId",
  "channelId",
  "threadId",
  "messageId",
  "dmId",
  "approvalId",
  "missionId",
  // An agent's browser handoff (ADR 0040): opens its live view.
  "handoffId",
  "routineId",
  "agentId",
  "machineId",
  "topicId",
  "issueNumber",
  // A device's notifications: the phone it is about, and the join or access request.
  "phoneId",
  "requestId",
] as const;

export function readPushData(data: unknown): PushData {
  const out: PushData = {};
  if (!data || typeof data !== "object") return out;
  const o = data as Record<string, unknown>;
  for (const key of FIELDS) {
    const v = o[key];
    if (typeof v === "string" && v.length > 0 && v.length <= 200) out[key] = v;
  }
  return out;
}

/**
 * A push about the conversation open on screen stays quiet (no banner, no sound, no buzz): what it says
 * is already arriving in front of the person.
 */
export function quietWhileOpen(data: PushData, open: { orgId: string; channelId: string } | null): boolean {
  if (!open || !data.channelId) return false;
  return data.channelId === open.channelId && (!data.orgId || data.orgId === open.orgId);
}

/**
 * Who holds a value (the conversation on screen): `hold` sets it and returns the release, which clears it
 * only if it still holds that same value. A screen that loses focus after the next one took over (React
 * Navigation may blur the old one after focusing the new one) doesn't wipe the new one's value.
 */
export function createHolder<T extends object>() {
  let current: T | null = null;
  return {
    get: () => current,
    hold(value: T) {
      current = value;
      return () => {
        if (current === value) current = null;
      };
    },
  };
}

/**
 * What a phone registers for pushes: its token, and on an iPhone its app and Apple's environment (ADR 0178).
 * `sharedWith`: the other accounts this phone is signed in to on that server, by id (ADR 0183): they keep hearing
 * pushes on this token too.
 */
export interface DeviceRegistration {
  token: string;
  platform: string;
  locale: string;
  appId?: string | null;
  sandbox?: boolean;
  sharedWith?: readonly string[];
}

/** The body of `POST /api/app/push/devices`. */
export function deviceBody(r: DeviceRegistration): {
  token: string;
  platform: "ios" | "android";
  locale: string;
  appId?: string;
  sandbox?: true;
  sharedWith?: string[];
} {
  const shared = r.sharedWith?.length ? { sharedWith: r.sharedWith.slice(0, 8) } : {};
  if (r.platform !== "ios") return { token: r.token, platform: "android", locale: r.locale, ...shared };
  return {
    token: r.token,
    platform: "ios",
    locale: r.locale,
    ...(r.appId ? { appId: r.appId } : {}),
    ...(r.sandbox ? { sandbox: true as const } : {}),
    ...shared,
  };
}

/** What the iPhone app's provisioning profile says about push (`embedded.mobileprovision`). */
export interface ProfileFacts {
  /** `aps-environment`: which of Apple's push environments the app's tokens belong to. */
  apsEnvironment: "development" | "production" | null;
  /** The bundle id from `application-identifier` (team prefix dropped), unless it is a wildcard. */
  appId: string | null;
}

/**
 * A `file://` URI for a directory expo-file-system may hand over as a bare path (the app bundle on iOS): a path
 * without a scheme isn't readable through it. Spaces in the app's name are percent-encoded once.
 */
export function fileUri(pathOrUri: string): string {
  if (pathOrUri.startsWith("file://")) return pathOrUri;
  let path = pathOrUri;
  try {
    path = decodeURI(pathOrUri);
  } catch {
    // Not encoded.
  }
  return `file://${encodeURI(path)}`;
}

/** Bytes as Latin-1 text: the profile is a signed (CMS) blob with its plist XML inside as plain ASCII. */
export function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let at = 0; at < bytes.length; at += 8192) {
    out += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return out;
}

const plistString = (text: string, key: string): string | null => {
  const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]{1,300})</string>`).exec(text);
  return m?.[1]?.trim() || null;
};

/** Reads the profile's entitlements: `aps-environment` and the app's id. Junk reads as nothing. */
export function readProfile(text: string): ProfileFacts {
  const aps = plistString(text, "aps-environment");
  const identifier = plistString(text, "application-identifier");
  const appId = identifier?.includes(".") ? identifier.slice(identifier.indexOf(".") + 1) : null;
  return {
    apsEnvironment: aps === "development" || aps === "production" ? aps : null,
    appId: appId && !appId.includes("*") ? appId : null,
  };
}

/**
 * Where an iPhone build's pushes go (ADR 0178): the app's id (Apple's topic for it) and whether its token is the
 * sandbox's. The provisioning profile comes first: it is what signs the build, so it is right even when a
 * development build loads a config made for another variant. No profile (an App Store or TestFlight install) is
 * production. The build's config is the fallback for the id. Android needs neither.
 */
export function pushTarget(
  os: string,
  profile: ProfileFacts | null,
  config: { ios?: { bundleIdentifier?: string } } | null | undefined,
): { appId: string | null; sandbox: boolean } {
  if (os !== "ios") return { appId: null, sandbox: false };
  return {
    appId: profile?.appId ?? config?.ios?.bundleIdentifier ?? null,
    sandbox: profile?.apsEnvironment === "development",
  };
}

/** `DELETE /api/app/push/devices/:token` path (encoded: an FCM token has a colon, an older build's had brackets). */
export const devicePath = (token: string) => `/api/app/push/devices/${encodeURIComponent(token)}`;

/**
 * The token `getDevicePushTokenAsync` / `addPushTokenListener` hand over (`{ type, data }`): a string, the FCM
 * registration token on Android (ADR 0152) and the APNs device token on an iPhone (ADR 0178). Anything else is no
 * token.
 */
export function systemToken(token: { data?: unknown } | null | undefined): string | null {
  const data = token?.data;
  return typeof data === "string" && data.length > 0 && data.length <= 2048 ? data : null;
}
