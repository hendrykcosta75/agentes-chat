import Constants from "expo-constants";
import * as Device from "expo-device";
import { File, Paths } from "expo-file-system";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { authedFetch } from "./auth";
import {
  createHolder,
  type DeviceRegistration,
  deviceBody,
  devicePath,
  fileUri,
  latin1,
  type ProfileFacts,
  pushTarget,
  quietWhileOpen,
  readProfile,
  readPushData,
  systemToken,
} from "./push-payload";
import { accountsSharing, placeAccounts, placeKey, signedInServers } from "./server";
import { pushPlace, serverOf } from "./server-choice";
import { readValue, STORED, writeValue } from "./storage";

/**
 * Push notifications (ADR 0035 §4, ADR 0152, ADR 0178). The system's prompt comes only after our sheet on Conversas
 * (`features/push`, `@agenteschat/client/lib/push-offer`) or the switch in Você; the app registers its push token
 * with the server, and removes it on sign-out. The token is the system's own: Android's FCM token (the server
 * sends to Firebase) and the iPhone's APNs token (the server sends to Apple), with the iPhone app's id and whether
 * the build gets its pushes from Apple's sandbox.
 */

/** A conversation on screen: a channel or a DM, or one of its threads. */
export interface OpenConversation {
  orgId: string;
  channelId: string;
  threadId?: string | null;
}

/** The conversation on screen (the chat screen holds it while focused). */
const openConversation = createHolder<OpenConversation>();

/** This screen's conversation is on screen; the returned release clears it only if no other screen took over. */
export const holdOpenConversation = (open: OpenConversation) => openConversation.hold(open);

/** The conversation on screen now, if any. */
export const openConversationNow = () => openConversation.get();

/**
 * The island draws what arrives while the app is open (ADR 0071 §9): set while it is up, with the socket live. The
 * system's banner then stays away, so nothing shows twice; with the socket down the banner is still there.
 */
let islandLive = false;
export const setIslandLive = (live: boolean) => {
  islandLive = live;
};

/**
 * Notifications shown while the app is open: the island's, or else a banner with no sound; nothing for the
 * conversation on screen. The island only draws the server open now: another server's push keeps its banner
 * (ADR 0154).
 */
export function configureForegroundPush() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = readPushData(notification.request.content.data);
      const here =
        pushPlace(data.server, placeKey(), signedInServers(), { user: data.user, accounts: placeAccounts() }).kind ===
        "here";
      const quiet = here && (islandLive || quietWhileOpen(data, openConversation.get()));
      return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
}

export async function ensureAndroidChannel(name: string, description: string) {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name,
    description,
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => {});
}

export type PushPermission = "granted" | "denied" | "undetermined";

export async function pushPermission(): Promise<PushPermission> {
  try {
    const s = await Notifications.getPermissionsAsync();
    return s.granted ? "granted" : s.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "denied";
  }
}

let profile: Promise<ProfileFacts | null> | null = null;

/**
 * The iPhone build's provisioning profile (`embedded.mobileprovision` in the app bundle), read once: which of
 * Apple's push environments its token belongs to and the app's id (./push-payload.ts `pushTarget`). `null` on
 * Android, and on an App Store or TestFlight install (it has none: production).
 */
function provisioningProfile(): Promise<ProfileFacts | null> {
  if (Platform.OS !== "ios") return Promise.resolve(null);
  profile ??= (async () => {
    try {
      const file = new File(fileUri(Paths.bundle.uri), "embedded.mobileprovision");
      if (!file.exists) return null;
      return readProfile(latin1(await file.bytes()));
    } catch {
      return null;
    }
  })();
  return profile;
}

let tokenUploadOff = false;

/**
 * Builds that asked for an Expo push token left expo-notifications' own token upload on: with it, each launch and
 * each new token would still go to Expo's servers. Turned off once per launch (ADR 0178: nothing goes to Expo).
 */
async function stopTokenUpload() {
  if (tokenUploadOff) return;
  tokenUploadOff = true;
  await Notifications.setAutoServerRegistrationEnabledAsync(false).catch(() => {});
}

interface Registration {
  ask: boolean;
  locale: string;
  /** The new token a token listener got (the listener must not ask the system for it again). */
  token?: string;
}

/** Registrations run one at a time: asking the system for the token may also fire the token listener. */
let queue: Promise<unknown> = Promise.resolve();

/** How long a registration waits for the server: one that doesn't answer must not hold the ones queued after it. */
const REGISTER_WAIT_MS = 15_000;

/**
 * Registers this phone for pushes. With `ask`, shows the system prompt when not decided yet; without
 * it, only registers when permission is already granted. Returns whether a token was registered.
 */
export function registerForPush(registration: Registration): Promise<boolean> {
  const run = queue.then(() => register(registration));
  queue = run.catch(() => {});
  return run;
}

/** This phone's push token, from the system: Android's FCM token, the iPhone's APNs token. */
async function phoneToken(): Promise<string | null> {
  try {
    return systemToken(await Notifications.getDevicePushTokenAsync());
  } catch {
    return null;
  }
}

async function register({ ask, locale, token: given }: Registration): Promise<boolean> {
  if (!Device.isDevice) return false;
  // The listener's token is the one just registered (asking the system for it fired the listener): done.
  if (given && (await readValue(STORED.pushToken)) === given) return true;
  // Turned off while this one waited in the queue: registering now would turn it back on.
  if (!ask && (await pushTurnedOff())) return false;
  let permission = await pushPermission();
  if (permission === "undetermined" && ask) {
    await writeValue(STORED.pushAsked, "1");
    const s = await Notifications.requestPermissionsAsync().catch(() => null);
    permission = s?.granted ? "granted" : "denied";
  }
  if (permission !== "granted") return false;
  void stopTokenUpload();
  const token = given ?? (await phoneToken());
  if (!token) return false;
  const target = pushTarget(Platform.OS, await provisioningProfile(), Constants.expoConfig);
  const device = { token, platform: Platform.OS, locale, ...target };
  // On every server this phone is signed in to, so pushes come from all of them (ADR 0154), and as every account on
  // one (ADR 0183). The account in use goes last: on a server that still keeps a token for one person, it is the one
  // that hears it.
  const here = placeKey();
  const places = pushServers();
  const results = await Promise.all(places.filter((p) => p !== here).map((p) => registerOn(p, device)));
  if (places.includes(here)) results.push(await registerOn(here, device));
  if (!results.some(Boolean)) return false;
  // A token this phone registered before (the system rolled it, or an Expo token from an older build) is
  // forgotten on the servers, so pushes don't go to a token nothing answers.
  const previous = await readValue(STORED.pushToken);
  await writeValue(STORED.pushToken, token);
  await writeValue(STORED.pushOff, null);
  if (previous && previous !== token) await Promise.all(pushServers().map((server) => forgetToken(previous, server)));
  return true;
}

/**
 * The places that push to this phone: every server signed in to and every account on one (ADR 0183), or the current
 * one before any session is known.
 */
const pushServers = () => {
  const list = signedInServers();
  return list.length ? [...list] : [placeKey()];
};

async function registerOn(server: string, device: DeviceRegistration): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REGISTER_WAIT_MS);
  const res = await authedFetch(
    `${serverOf(server)}/api/app/push/devices`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(deviceBody({ ...device, sharedWith: accountsSharing(server) })),
      signal: abort.signal,
    },
    server,
  ).catch(() => null);
  clearTimeout(timer);
  return Boolean(res?.ok);
}

/**
 * Registers again whenever the system gives the app a new token while it runs (FCM and APNs may roll it), unless
 * the person turned notifications off. Returns the unsubscribe.
 */
export function watchPushToken(locale: () => string): () => void {
  try {
    const sub = Notifications.addPushTokenListener((next) => {
      const token = systemToken(next);
      if (!token) return;
      void (async () => {
        if (await pushTurnedOff()) return;
        if ((await pushPermission()) !== "granted") return;
        await registerForPush({ ask: false, locale: locale(), token });
      })();
    });
    return () => sub.remove();
  } catch {
    // No native module (tests).
    return () => {};
  }
}

/** Whether the person turned notifications off in the app. */
export const pushTurnedOff = async () => (await readValue(STORED.pushOff)) === "1";

/** How long signing out waits for each answer: a server that doesn't answer must not hold the phone. */
export const SIGN_OUT_WAIT_MS = 5000;

/** Deletes a token from a server, waiting at most `SIGN_OUT_WAIT_MS`. Never throws. */
async function forgetToken(token: string, server: string): Promise<void> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SIGN_OUT_WAIT_MS);
  await authedFetch(
    `${serverOf(server)}${devicePath(token)}`,
    { method: "DELETE", signal: abort.signal },
    server,
  ).catch(() => null);
  clearTimeout(timer);
}

/**
 * Removes this phone's token from every server it pushes from. Never throws. By default this is the person turning
 * notifications off (remembered, so the app doesn't register again on its own); signing out of the last server
 * passes `{ optOut: false }` (it forgets everything anyway).
 */
export async function unregisterPush({ optOut = true }: { optOut?: boolean } = {}): Promise<void> {
  if (optOut) await writeValue(STORED.pushOff, "1");
  const token = await readValue(STORED.pushToken);
  if (!token) return;
  await Promise.all(pushServers().map((server) => forgetToken(token, server)));
  await writeValue(STORED.pushToken, null);
}

/** Signing out of one server while others stay (ADR 0154): only that one stops pushing to this phone. Never throws. */
export async function unregisterPushOn(server: string): Promise<void> {
  const token = await readValue(STORED.pushToken);
  if (token) await forgetToken(token, server);
}
