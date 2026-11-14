# 0152. Android push straight to Firebase, and a push relay for self-hosted servers

- Status: Accepted
- Date: 2026-11-02
- Amends: 0035 §4 (phone pushes went through the Expo Push API on both platforms)
- Amended by: 0178 (§6: iPhones go straight to Apple, and through the relay too)
- Code: `packages/adapters/src/push-fcm.ts` (`createFcmPushSender`, `fcmMessage`), `push-relay.ts`
  (`createRelayPushSender`), `push.ts` (`createPhonePushSender`, `PushMessage.platform`);
  `packages/config/src/pem.ts` (`parseFirebaseServiceAccount`), `schema.ts` (`FIREBASE_SERVICE_ACCOUNT`,
  `PUSH_SENDER`, `PUSH_RELAY_URL`, `PUSH_RELAY_SERVE`); `packages/engine/src/push.ts` (`FCM_PUSH_TOKEN`, per-phone
  failures in `deliverPush`), `push-relay.ts` (the relay's side), `push-relay-client.ts` (`relayCredentials`);
  `packages/db/src/schema/push.ts` (`push_relay_instances`, `instance_push.relay_*`, migration 0239);
  `apps/server/src/routes/app/push.ts`, `routes/push-relay.ts`, `app.ts`, `start.ts`; `apps/mobile/src/lib/push.ts`
  (`getDevicePushTokenAsync`, `watchPushToken`), `push-payload.ts` (`systemToken`), `src/providers/push.tsx`

## Context

ADR 0035 sent every phone push through the Expo Push API: the app registered an Expo push token, and Expo forwarded
each message to Firebase Cloud Messaging (Android) or APNs (iPhone). That puts a third party between the server and
the phone that sees each push's text and token, needs the Firebase key uploaded to Expo, and is one more service a
self-hosted install depends on. On Android nothing about it is needed: the app already shows notifications with
expo-notifications, which runs its own Firebase messaging service on the phone.

The Android app in the stores is built with agentes.chat's Firebase project, and only a service account of that
project can push to it. A self-hosted server doesn't have one, and must not need one for people to get its pushes.

## Decision

1. **Android pushes go from the server to FCM's HTTP v1 API**, with a service account of the Firebase project the
   app is built with (`FIREBASE_SERVICE_ACCOUNT`: the JSON key, or base64 of it). The sender signs a JWT (RS256),
   trades it at Google's token endpoint for an access token (shared by every send until five minutes before it
   expires; a 401 gets one new token and one more try), and sends one `messages:send` request per message, ten at a
   time.
2. **The message is a data message laid out the way expo-notifications presents it**: `title`, `message`, `body` (the
   deep link data as JSON, ADR 0035 §4), `channelId` (`default`, the channel the app creates) and `sound`. No
   `notification` block, so the app's own service gets it in every state; no `collapse_key` (FCM keeps four per
   phone, so a phone that was away would lose pushes). Priority `HIGH` for what waits on the person, else `NORMAL`;
   a day's TTL.
3. **A push relay for everyone else.** `PUSH_SENDER` picks the way: `auto` (default) sends straight to Firebase when
   the server has `FIREBASE_SERVICE_ACCOUNT` and through the relay otherwise; `direct` and `relay` force one; `off`
   sends no Android push. agentes.chat's servers run the relay (`PUSH_RELAY_SERVE=on`, at `/api/push-relay/v1`) with
   their own service account; a self-hosted server sends there (`PUSH_RELAY_URL`) with nothing to set up:
   - It registers itself on its first push (`POST /instances`, no account): the relay answers an id and a secret,
     keeps only the secret's SHA-256 (`push_relay_instances`), and the server keeps both sealed with its own key
     (`instance_push.relay_*`). A 401 (the relay forgot it, or the relay address changed) registers again once.
   - It sends the messages it would send to Firebase (`POST /send`, bearer `<id>.<secret>`, up to 100 a request). The
     relay accepts only Android messages with an FCM token, text and data within limits, and answers one result per
     message as FCM gave it. It counts 3,000 messages an hour per installation (over: 429) and 120 an hour per phone
     from every installation together (over: that message fails as `rate_limited`); registrations, 10 an hour per
     address. It stores no message: only how many each installation sent and when it last called.
   - The relay's operator can block an installation (`blocked_at`): its requests get 403 `blocked`, which never
     retries.
4. **The app registers the phone's own FCM token** (`getDevicePushTokenAsync`), and registers again when FCM hands
   it a new one while it runs (`addPushTokenListener`). A token the phone registered before is deleted on the server
   once the new one is in. The route takes an FCM token for `android` and an Expo token for `ios`, each refusing the
   other's.
5. **One `PushSender` for phones** (`createPhonePushSender`) sends each message to its platform's sender (both at
   once) and keeps the results in order; one platform's sender failing as a whole never keeps the other's phones
   from their push, and is thrown only when no phone took it. FCM and the relay answer per message: a gone token
   (`UNREGISTERED`, which comes with a 404, `SENDER_ID_MISMATCH`, a malformed token) is deleted, never a bare 404,
   which is about the request; 429, 5xx and the network are retryable; the rest is final. A token that can't be
   an FCM token never goes to the relay (it would refuse the whole request) and answers as gone. `deliverPush`
   counts those per-phone failures, and the outbox tries the job again only when nothing was sent and every
   failure can be retried, so a phone is never pushed twice.
6. **iPhones are unchanged for now**: Expo push tokens through the Expo Push API, with receipts.

## Consequences

- No Expo service between a server and an Android phone. Straight to Firebase, only Google sees the push; through the
  relay, agentes.chat's server sees each push's token, title, text and deep link ids on the way, as SELF_HOSTING.md
  lists. `PUSH_SENDER=off` keeps them home (no Android pushes), and a server with its own app build and Firebase
  project sends directly.
- The relay is public code switched on by an env var (ADR 0002), so anyone can run one for their own build.
- Builds made before this change register Expo tokens on Android, which the route now refuses; they never got Android
  pushes (no Firebase in the build), so nothing that worked stops.
