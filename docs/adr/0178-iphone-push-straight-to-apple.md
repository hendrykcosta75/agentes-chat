# 0178. iPhone push straight to Apple

- Status: Proposed
- Date: 2026-11-13
- Amends: 0152 §6 (iPhones stayed on the Expo Push API), 0035 §4 (push receipts)
- Code: `packages/adapters/src/push-apns.ts` (`createApnsPushSender`, `apnsRequest`, `createNodeHttp2Client`),
  `push-relay.ts` (iPhone messages), `push.ts` (`PushMessage.apns`); `packages/config/src/schema.ts` (`APNS_KEY`,
  `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_APP_IDS`, `PUSH_SENDER`); `packages/engine/src/push.ts` (`APNS_PUSH_TOKEN`,
  `PushDeviceInput.appId` and `sandbox`), `push-relay.ts` (`relayMessage`); `packages/db/src/schema/push.ts`
  (`push_devices.app_id`, `apns_sandbox`, migration 0273); `apps/server/src/push-senders.ts`, `start.ts`, `app.ts`,
  `routes/app/push.ts`; `apps/mobile/src/lib/push.ts` (`getDevicePushTokenAsync` on both platforms,
  `provisioningProfile`), `push-payload.ts` (`pushTarget`, `readProfile`)

## Context

ADR 0152 took Android pushes off the Expo Push API and left iPhones on it. An iPhone push therefore still passed
through a third party that sees its token and its text, and needed the team's APNs key uploaded to that third party's
account before a single push could arrive. The app is published without any of Expo's services (builds, credentials
or push), so that key was never there: iPhones got no push at all.

Apple's push service (APNs) takes requests directly: HTTP/2, a token signed with an auth key of the team that signs
the app. The app already shows notifications with expo-notifications, which works with the system's own device token
as it does on Android.

As with Firebase on Android, only the team that signs the app in the App Store can push to it, and a self-hosted
server must not need that key for its people to get pushes.

## Decision

1. **iPhone pushes go from the server to APNs** (`api.push.apple.com`, HTTP/2), with an APNs auth key of the team
   that signs the app: `APNS_KEY` (the .p8 file), `APNS_KEY_ID` and `APNS_TEAM_ID`, which work only together. The
   sender signs a provider token (a JWT, ES256), shares it between every send for 50 minutes (Apple takes one up to
   an hour old and refuses one made again more often than every 20 minutes), and makes it again once when Apple
   refuses it. One connection per APNs host is kept open and reused, opened again after Apple closes it, and closed
   after ten idle minutes; ten requests at a time, one per message.
2. **The message is an alert**: `aps.alert` with the title and the text, the default sound, `aps.category` when the
   notification has buttons, and the deep link data (ADR 0035 §4) under the payload's `body` key, where
   expo-notifications reads a notification's data. Priority 10 always: Apple delivers priority 5 when it suits the
   phone's battery, which can be minutes later, and every push here tells a person something. A day's expiration.
3. **The app registers the system's own token** (`getDevicePushTokenAsync`, as on Android), registers again when the
   system hands it a new one, and sends two more facts with it, which the server keeps (`push_devices.app_id`,
   `apns_sandbox`):
   - its bundle id, which is the APNs topic. The same key signs for the store app and for the builds that install
     beside it (`.preview`, `.development`), so the server must know which one holds the token;
   - whether it is a development build, whose token belongs to Apple's sandbox. The app reads both from the profile
     that signs the build (`embedded.mobileprovision`: `application-identifier` and `aps-environment`); a store or
     TestFlight install has none and is production.
4. **A server pushes only to the apps it names** (`APNS_APP_IDS`, by default the three bundle ids of the official
   app). An auth key signs for every app of its team, so a message for another bundle id is refused before it leaves
   the server; one that names none goes to the first. This matters most on the relay, where the bundle id comes from
   another installation.
5. **A token Apple calls `BadDeviceToken` is tried once on the other environment** before it counts as gone. That is
   Apple's answer to a sandbox token sent to production and the reverse, and a build that told its environment wrong
   would otherwise lose its token on every push and register it again on every launch.
6. **What each answer means**: 200 is sent; 410, `Unregistered`, `BadDeviceToken` (after §5), `DeviceTokenNotForTopic`
   and a token that isn't hex delete the device; 429, 5xx and the network are retryable; a refused provider token
   (after one new token), a bundle id outside `APNS_APP_IDS` and other 4xx are final. Apple answers each message at
   once, as Firebase does, so there is nothing to ask about later: the receipts job (ADR 0035) and the Expo sender
   are removed, with `EXPO_ACCESS_TOKEN`.
7. **The push relay carries iPhones too.** `PUSH_SENDER` decides for each platform on its own: `auto` sends straight
   to Apple when the server has the three `APNS_*` variables and through the relay otherwise (Android likewise with
   `FIREBASE_SERVICE_ACCOUNT`); `direct`, `relay` and `off` apply to both. A relay message for an iPhone carries
   `platform: "ios"`, an APNs device token, and optionally `apns: { topic, sandbox }` and `category`; the relay checks
   their shape, and its APNs sender refuses a bundle id that isn't one of its own. A server that runs the relay
   (`PUSH_RELAY_SERVE`) serves the platforms it has credentials for, and answers the others' messages as skipped, so
   the calling server keeps those devices. One relay sender serves both platforms on the calling server, so it
   registers there once. The server whose own address is the relay's (`PUBLIC_URL` and `PUSH_RELAY_URL` on one host)
   sends nothing for a platform it has no credentials for, instead of calling itself: it runs without the Apple key,
   keeps the iPhones that register, and pushes them once the key is set.
8. **Nothing goes to Expo.** The app stops asking for an Expo push token and turns off expo-notifications' own
   upload of the device token to Expo's servers. An Expo token registered by an older build answers as gone on its
   next push and is deleted; the route takes an APNs device token for `ios` and refuses anything else.

## Consequences

- No third party stands between a server and an iPhone: straight to Apple, only Apple sees the push; through the
  relay, agentes.chat's server sees each push's token, bundle id, title, text and deep link ids on the way, as
  SELF_HOSTING.md lists. `PUSH_SENDER=off` keeps them home.
- An iPhone build made before this change registers an Expo token, which the route now refuses: it gets no push until
  it is updated. Those builds got none before either (no APNs key was ever given to Expo), so nothing that worked
  stops.
- The bundle id needs the Push Notifications capability and the build's profile must carry it; a team that builds its
  own app pushes to it with its own key and bundle ids (`APNS_APP_IDS`).
- A phone whose profile can't be read registers as production with the config's bundle id; §5 covers the case where
  that was wrong, at the cost of one extra request per push.
- The alert's text travels in the clear to Apple, as it does to Firebase on Android. Sealing it end to end would need
  a notification service extension on the iPhone and is left for its own decision.
