# 0179. App icons: drawn from the agent engine, and picked per device

- Status: Proposed
- Date: 2026-11-10
- Code: generator `packages/ui/scripts/app-icons.mjs` (`app-icons/scenes.mjs`, `app-icons/raster.mjs`), desktop
  `apps/desktop/scripts/icons.ts`; the list
  `packages/client/src/lib/app-icons.ts` (`APP_ICONS`); phone `apps/mobile/plugins/with-app-icons.js`,
  `apps/mobile/modules/app-icon`, `src/features/me/app-icon.ts`, `app-icon-names.ts`, `AppIconPage.tsx`; web `src/lib/app-icon.ts`, `src/lib/agent-app-icon.ts`, `components/AppIconPicker.tsx`,
  `AccountSettings.tsx`; desktop
  `src-tauri/src/app_icon.rs`, `this_mac` `appIcon` (`main_window.rs`); tests `packages/ui/test/app-icons.test.ts`,
  `apps/mobile/test/app-icons.test.ts`, `apps/web/test/app-icon.test.ts`

## Context

Each app drew its icon its own way: the phone's was a picture made once (the agent tilted on the night sky), the
desktop app's had a black frame around the agent (a square inside a square), and the web had only the 32 px SVG
favicon, which a browser shrinks to 16 px, where its dither and eyes blur. iOS 18 asks for a dark and a tinted icon
too, and Android 13 for a one-color one; none existed. The web app had no icon for a phone's home screen.

Comparing directions, more than one was liked, which raised the question of letting each person pick.

## Decision

1. **One set of scenes for every icon file.** Each icon is drawn from the agent engine
   (`packages/ui/src/agent/engine.js`: the body with the cut corner, its dither, the white eyes) by a small rasterizer
   with no dependency, which covers a pixel exactly inside a shape and samples 4×4 on its edges, and writes PNG and
   ICO. `node packages/ui/scripts/app-icons.mjs` writes the phone's and the web's files, which are committed: iOS
   1024 in light, dark and tinted; Android's adaptive layers (back, front and one-color) and a PNG for Android before
   8; the web's `favicon.ico`, `apple-touch-icon.png` and `icon-512.png`. The desktop app's icons folder is never
   committed, so its build draws them from the same scenes (`apps/desktop/scripts/icons.ts`, before `tauri icon` and
   `cargo test`): the bundle's 1024 master in macOS's shape and shadow on Apple's grid (no black tile around the agent
   any more), and each icon's Dock and window pictures. Changing an icon means changing its scene and running the
   script again.

2. **The scenes sit on a pixel grid.** A 1024 icon is 32 cells a side and the agent's dither cells are the sky's
   cells, so nothing is half a pixel. The favicon is drawn on its own at 16 and 32 px with its eyes on whole pixels
   and mirrored (at 16 px the body is three flat bands, as a dither there is noise); the `.ico` carries both, and
   browsers pick by size. `favicon.svg` stays as the agent's mark (the boot screen, apps' and connectors' logos).

3. **Five icons.** Night ships (the night sky with a dither glow around the agent); Moon, Sky (the day sky with the
   sky's navy agent), Peeking at night and Peeking in the sky (the agent big, coming up from the bottom edge) are
   the others. `APP_ICONS` is the list; the generator, the phone's plugin and the desktop app list the same ids and
   a test keeps them equal.

4. **The pick is the device's, not the account's.** Like the theme, it is set where it shows, and never synced: iOS
   confirms each change with an alert of its own, which a sync would show on a phone nobody touched.
   - **iPhone**: the others are alternate icons, `AppIcon-<id>` sets in the asset catalog (each in light, dark and
     tinted) named in `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`, switched with `setAlternateIconName` by a
     local Expo module (`modules/app-icon`).
   - **Android** has no call for it. The launcher's entry moves from `MainActivity` to one `activity-alias` per icon
     (`.AppIcon<Id>`, only the shipped one on in the manifest), each with its own adaptive icon; the module turns the
     picked alias on and then the others off, so the launcher always has one. Launchers redraw in their own time and
     some close the app while they do; the screen says the first.
   - **Desktop app**: macOS shows the bundle's icon wherever the app isn't running (Finder, Launchpad, the Dock of
     a closed app), and changing the bundle would break its signature. So the pick is the Dock's icon while the app
     runs (`NSApplication.applicationIconImage`), and the windows' (the taskbar's) on Windows and Linux, shown again
     at launch, when the Dock tile comes back and when a window is made. The app keeps it (`app-icon.json` in its
     config folder), so every server's pages see the same; the site asks it through `this_mac` `appIcon` (an id
     from the app's own list, or none to read the kept one), offered as `appIcon` in `window.__agentesDesktop`.
   - **Browser**: the tab's icon, kept in the browser's storage. The home screen icon a phone makes from the site
     (`apple-touch-icon`) stays the shipped one.

4a. **On the web and the desktop app, a workspace's agent can be the icon too.** A phone can't: iOS and Android take
   only icons its build carries. The site draws the agent (`apps/web/src/lib/agent-app-icon.ts`): the Night's sky
   without its agent (`/app-icons/night-sky.png`, from the generator) and the agent by the agent engine in its own
   color, eyes and accessory, on the sky's cells as the shipped icon's (with an accessory, smaller and lower so it
   fits). The tab's icon is drawn pixel by pixel like the shipped favicons, without the accessory (noise at 16 px).
   The pick keeps who the agent is (its workspace's id and its own, its name and look): a browser keeps it in its
   storage; the desktop app, which can't draw, is sent the Dock's picture (512, macOS's shape and shadow) and the
   windows' (256), checked as PNGs of at most 1 MiB (`app_icon::about`, `picture`) and kept beside the choice, so the
   Dock shows the agent on every server. When the agent's workspace is open and its name or look changed, the icon
   is drawn again (`followPickedAgent`); an agent no longer there keeps the icon as it was.

4b. **On the phone, a person makes their icon.** Since a phone takes only icons its build carries, the build carries
   every icon that can be made: a sky (Night or Sky), one of the agents' eight colors, and either a face (the five
   eye styles and five expressions that hold as a still picture) or one of the eleven accessories, 336 in all
   (`MADE_ICON_*` in `packages/client/src/lib/app-icons.ts`; the generator and the plugin list the same parts and
   tests keep them equal). A face and an accessory together would be 1,920 icons, so it is one or the other; a free
   color has no icon to show. Their files are not committed: the plugin runs
   `packages/ui/scripts/app-icons/made-files.mjs` when the app is built, which draws each part once and puts the
   icons together, and keeps the result while those scripts stay the same (`node_modules/.cache/app-icons`). A made
   icon is `made-<sky>-<color>-<look>`: one more `AppIcon-<id>` set on iOS, with a single look (no dark or tinted
   version), and one more alias on Android, whose back layer is its sky's and whose one-color layer is its face's or
   accessory's, shared. Android's module turns off only the alias that was on, since each change is a call to the
   system and there are hundreds.

5. **Where.** Settings › Account › This device › App icon on the web and in the desktop app (a dialog listing the
   icons with their pictures, then the open workspace's agents side by side, each drawn as the icon it makes; a pick
   applies at once), and the phone's You › App icon (a pushed screen: the icon as the home screen will show it, the
   parts it is made of, the five ready ones, and "Use this icon", so trying the choices doesn't show iOS's alert each
   time). Where the
   build or the app can't change it (a phone build or a desktop app from before), the row isn't there.

## Consequences

- An icon's picture changes only through the generator; the phone's and the desktop's new icons reach people only
  with a new build of each.
- A new icon is a scene in `scenes.mjs`, an id in `APP_ICONS`, in the plugin's and `app_icon.rs`'s lists, and its
  name in every language (`appIcon.names`); the tests catch a list left behind or a missing file.
- On Android the launcher's entry is no longer `MainActivity` but an alias pointing to it: links, shares and
  notifications still open `MainActivity`, and the package's launch intent resolves to whichever alias is on.
