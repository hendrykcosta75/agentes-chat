# agentes (phone app)

Expo + React Native app for agentes.chat (ADR 0035).

Code is checked in CI (`.github/workflows/ci.yml`: lint, typecheck,
unit tests of the pure logic in `apps/mobile/test`). Android builds on the **Android build** workflow
(`.github/workflows/android.yml`) and iOS on **iOS build** (`.github/workflows/ios.yml`); EAS
(`.github/workflows/mobile.yml`) still works for either platform.
The native projects (`ios/`, `android/`) are made from `app.config.ts` and `plugins/` by `expo prebuild` and never
committed. **Credentials never go in the repo** (it is public): the upload key, Firebase's files and store accounts
live in GitHub's secrets or the stores.

## Android on GitHub Actions

Run **Android build** (Actions → Run workflow) with `preview` (an arm64 APK to install directly, kept as the run's
artifact) or `production` (an app bundle for arm64 and 32-bit ARM phones; with `PLAY_SERVICE_ACCOUNT_JSON` set it also
goes to the Play Store's internal track as a draft). It runs `expo prebuild --platform android --clean` and Gradle on
GitHub's standard runner (or `CI_RUNNER_XLARGE`), with extra swap and two Gradle workers so it fits in 16 GB;
`plugins/with-android-release-signing.js` signs the release with the upload key from the environment. Nothing goes
through EAS.

One time, in GitHub → Settings → Secrets and variables → Actions:
1. The upload key: make one once (`keytool -genkeypair -v -storetype PKCS12 -keystore upload.keystore -alias upload
   -keyalg RSA -keysize 2048 -validity 10000`) and keep it and its password somewhere safe; every update on the Play
   Store is signed with it (Play App Signing lets Google reset a lost one). Add `ANDROID_KEYSTORE_BASE64`
   (`base64 -i upload.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`) and
   `ANDROID_KEY_PASSWORD` (a PKCS12 keystore uses the same password for both). Without them the workflow stops at
   its first step.
2. Optional: `GOOGLE_SERVICES_JSON_BASE64`, Firebase's `google-services.json` in base64, for push on Android. The
   file must list the variant's package (`chat.agentes.app`, `chat.agentes.app.preview`); otherwise that build is
   made without push and the run says so. The server sends those pushes to Firebase itself, with a service account of
   the same Firebase project (`FIREBASE_SERVICE_ACCOUNT`); other servers send through its push relay (ADR 0152).
3. The variable `ANDROID_VERSION_CODE_BASE` (Variables tab, not Secrets), added to the run number: the last version
   code on Play, or `0` before the first upload. A production build stops at once without it.
4. Optional: `PLAY_SERVICE_ACCOUNT_JSON` (a Play Console service account allowed to release; Play takes API uploads
   only after the app's first bundle was uploaded by hand).

A preview APK installs over an earlier one only when both were signed with the same key.

## iOS on GitHub Actions

Run **iOS build** (Actions → Run workflow): production only, sent to TestFlight (or, with "Send to TestFlight" off,
an `.ipa` kept as the run's artifact). It runs `expo prebuild --platform ios --clean`, `pod install`, then
`xcodebuild archive` and `-exportArchive` on a macOS runner. Signing is automatic: with the App Store Connect API
key, Xcode asks Apple for the certificate and the profiles of the app and its share extension
(`chat.agentes.app.share-extension`, app group `group.chat.agentes.app`), so no certificate or profile is stored
anywhere. Nothing goes through EAS.

One time:
1. In App Store Connect: the app exists for `chat.agentes.app` (an upload is refused before that), and an API key
   with the **Admin** role (Users and Access → Integrations → App Store Connect API); automatic signing takes no
   lesser role.
2. In GitHub → Settings → Secrets and variables → Actions: `APPLE_TEAM_ID` (the team's id), `ASC_API_KEY_ID` (the
   key's id), `ASC_API_ISSUER_ID` (the issuer id) and `ASC_API_KEY_P8` (the text of the `.p8` file). Without them
   the workflow stops at its first step.
3. Optional: the variable `IOS_BUILD_NUMBER_BASE` (added to the run number) above the last build number in App
   Store Connect, if any.

A build made by your own team needs your own bundle id: Apple gives `chat.agentes.app` to one team only.

## Get a build on a phone with EAS

1. One time, on expo.dev: create an access token (Account settings → Access tokens). The EAS project
   already exists; its ID is in `app.config.ts` (`EAS_PROJECT_ID` overrides it).
2. In GitHub → Settings → Secrets and variables → Actions: secret `EXPO_TOKEN` = the access token.
3. Run the workflow **Mobile build (EAS)** (Actions → Run workflow), profile `preview`, platform `all`.
   Builds run only by hand, so the EAS quota is spent on purpose. The button appears once this workflow is on `main`.
4. Open the build on expo.dev from the phone:
   - Android: the `preview` profile makes an APK; install it from the link.
   - iOS: `preview` is an internal (ad hoc) build. Register the iPhone once on expo.dev
     (Devices → Register, a link to open on the phone), then build again. iOS builds need an Apple
     Developer account connected to EAS (credentials are managed by EAS on the first build).
5. `development` builds include the dev client; `production` builds go to the stores (`eas submit`).

## Environment

Set in the build's environment: the Android workflow, or per profile in `eas.json` (`build.<profile>.env`) /
on expo.dev (EAS environment variables) for EAS:

| Variable | What | Default |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | The default server. **Must be the server's `PUBLIC_URL` host** (see below). | `https://app.agentes.chat` |
| `EAS_PROJECT_ID` | EAS project, for those who build with EAS. | ours (`8514d5b3-…`) |
| `GOOGLE_SERVICES_JSON` | Path to Firebase's `google-services.json` (the Android workflow writes it from a secret): push on Android (FCM). | none |
| `ANDROID_VERSION_CODE` | The build's version code (the Android workflow's run). | from the config |
| `APPLE_TEAM_ID` | The Apple team that signs the iOS app and its share extension (the iOS workflow's secret). | none |
| `IOS_BUILD_NUMBER` | The build's number on iOS (the iOS workflow's run). | from the config |
| `APP_VARIANT` | `development` / `preview` / `production`: name and bundle id suffix, so all three install side by side. | `production` |

Why the API URL must equal the public URL: React Native's WebSocket adds an `Origin` derived from the URL
(`wss://host` → `https://host`). The server accepts a request without `Origin` that carries
`X-Agentes-Client: mobile`, and refuses a foreign `Origin` even with the header. So the app's host must be the
one the server considers its own.

People can point the app at their own server ("Servidor: agentes.chat · Trocar" on sign-in, a QR code from the web
app's "Abrir no celular", or an `agenteschat://connect?server=…` link). The app checks `GET /api/instance` first and,
for the same reason, uses the address the server gives there (its `PUBLIC_URL`); when that address doesn't answer from
the phone, the server is refused with that host in the message. Switching signs out of the previous server. Pushes from
a self-hosted server reach the app from the stores, on Android and on the iPhone, through agentes.chat's push relay
(`PUSH_SENDER`, ADR 0152, ADR 0178).

Push on the iPhone comes straight from Apple (APNs), with no Expo service in between: the app registers the system's
own device token, its bundle id and whether the build gets its pushes from Apple's sandbox, read from the profile
that signs it (`src/lib/push.ts`). The server sends with an APNs auth key of the team that signs the app (`APNS_KEY`,
`APNS_KEY_ID`, `APNS_TEAM_ID`, and the bundle ids in `APNS_APP_IDS`); the bundle id needs the Push Notifications
capability, and a build made by your own team is pushed by your own server's key.

Server side (not in this folder): Better Auth's Expo plugin trusts `agenteschat://`; Sign in with Apple needs
`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, and the native iOS button sends an ID
token whose audience is the bundle id `chat.agentes.app` (the server's Apple provider must accept it).

## How it fits together

- `app/_layout.tsx`: providers + the session gate (signed out → `app/(auth)`, signed in with an organization →
  `app/(app)`). `app/(auth)`: sign in and sign up (forgot password in place), your server and the QR scanner.
  `app/connect.tsx`: the `agenteschat://connect` confirmation, in either state. The current server: `src/lib/server.ts`.
- `src/providers`: theme, i18n (`@agenteschat/i18n` + `src/i18n/keys.*.ts` under `mobile.*`), React Query, API
  (`useApi()` from `@agenteschat/client`), session (`useSession`), organization (`useOrg`), realtime
  (`useRealtime` → `{ connection, status }`), push (`usePush().ask()`), fonts.
- `src/lib`: auth client (session cookie in SecureStore), API client, WebSocket factory, push registration.
- `src/ui`: the design system for React Native (`import { … } from "@/ui"`).
- `src/features`: the screens and their pure logic (`logic.ts`, tested in `test/features`). Everything comes from the
  API through `@agenteschat/client` hooks, with no workarounds: unread counts and last lines from `GET …/channels` (and
  `useMarkChannelRead` on open), "Trabalhando agora" from `GET …/active-runs` (everyone, not only admins), "Seguir" in a
  thread (`useFollowThread`, live via the `thread.follow` person event), "Fixar" and "Fixadas" (`usePinMessage`,
  `usePins`, live via `message.pinned`/`message.unpinned`), "Lembrar" (`useReminderAction`, time with the device's
  offset and time zone) and "Copiar" (`expo-clipboard`).
- `src/agent`: agents drawn by the single engine (`@agenteschat/ui/agent/engine`) through a recorder + Skia
  replay (`recorder.ts`, `skia-ctx.ts`); one shared ~25 fps clock.
- `src/sky`: sky, fuse, spend bar and plan track as Skia shaders; `math.ts` mirrors the shader and is tested
  against the web's math (`@agenteschat/ui/sky/math`).

## Fonts

`assets/fonts` holds static instances from Google Fonts (all SIL Open Font License, texts in `OFL-*.txt`):
Funnel Display Light (large titles) and Doto at ROND 100, weight 600 (every count). Body and UI text use the
system font (SF Pro / Roboto) at the platform's sizes and follow the person's text size setting: the scale is
`src/ui/type-scale.ts` (HIG text styles on iOS, Material 3 on Android), used through `Text` variants and
`systemText` in `src/ui/Text.tsx`.
React Native has no variable-font axes, so each is a separate file; the family names are the keys in
`src/ui/theme.tsx` (`fonts`). To refresh them, request the same instances from
`https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300&family=Doto:ROND,wght@100,600`
without a browser user agent (it then serves `.ttf`).

## Images

`assets/images/*.png` are placeholders generated from the agent engine's shape and dither (icon 1024, Android
adaptive foreground 1024, splash 512, notification 96 white silhouette). Replace them with the final art at the
same sizes.

## React versions in the workspace

React Native's renderer needs the exact React it was built with (SDK 58: `react@19.3.0`), while the web may
resolve a newer patch at the root. `metro.config.js` resolves `react` and `react-native` from this folder for
every package, so the app bundle has a single React. Hierarchical lookup stays on (Bun's hoisted layout nests
conflicting versions under the packages that need them).
