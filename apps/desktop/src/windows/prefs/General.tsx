import type { AppLocale } from "@agenteschat/i18n/locale";
import { Button, Dialog, DialogFooter, Input, Select, Switch } from "@agenteschat/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHost, useSnapshot, useStore } from "../../app";
import { BROWSER_NOTIFY_PREF } from "../../control/browser";
import { MENU_BAR_PREF, menuBarShown } from "../../control/dock";
import { NOTCH_PREF } from "../../control/notch";
import { SITE_NOTIFY_PREF } from "../../control/notify";
import { unpairedWorkspaces } from "../../control/pair";
import { type Home, orgName, pairedHomes } from "../../control/store";
import { macStateOf } from "../../control/tray";
import { useLocalServer, usePref, useWorkspaces } from "../../hooks";
import { detectedLocale, LOCALE_PREF, locales, switchDesktopLocale } from "../../i18n";
import { MacPortrait } from "../../ui/bits";
import { CardTitle, hintFor, PrefCard, PrefHead, PrefRow } from "../../ui/settings";
import { useToast } from "../../ui/Toast";
import { ThisMacCards } from "./ThisMac";

export function General() {
  const { t, i18n } = useTranslation();
  const host = useHost();
  const store = useStore();
  const snap = useSnapshot();
  const toast = useToast();
  const homes = pairedHomes(snap);
  const works = homes.length > 0;
  // Every workspace the person is signed in to where agents may work here: those this computer works for, and these.
  const offers = unpairedWorkspaces(useWorkspaces(), snap);
  const agentsCard = works || offers.length > 0;
  const mac = host.platform === "mac";
  const local = useLocalServer();
  const current = homes.find((h) => h.status?.machine)?.status?.machine?.name ?? "";
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);
  const [launch, setLaunch] = useState<boolean | null>(null);
  const [notifySite, setNotifySite] = usePref(SITE_NOTIFY_PREF, true);
  const [notify, setNotify] = usePref("notify", true);
  // Off by default: the request already comes by push and in the site's "Waiting for you".
  const [notifyBrowser, setNotifyBrowser] = usePref(BROWSER_NOTIFY_PREF, false);
  // Off by default: the window only exists while it's on.
  const [notch, setNotch] = usePref(NOTCH_PREF, false);
  const [menuBar, setMenuBar] = usePref<boolean | null>(MENU_BAR_PREF, null);
  const [language, setLanguage] = usePref<AppLocale | "auto">(LOCALE_PREF, "auto");
  const [leaving, setLeaving] = useState<Home | null>(null);
  const [busy, setBusy] = useState(false);
  const iconShown = menuBarShown(menuBar, works || local.run);
  useEffect(() => {
    void host.setTrayVisible(iconShown).catch(() => {});
  }, [host, iconShown]);

  // The name arrives with the first status.
  useEffect(() => {
    if (current) setName((n) => n || current);
  }, [current]);

  // Pairing turns it on: read again when a workspace joins.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the count is the trigger
  useEffect(() => {
    host
      .autostart()
      .then(setLaunch)
      .catch(() => setLaunch(false));
  }, [host, homes.length]);

  const saveName = async () => {
    const clean = name.trim();
    if (!clean || clean === current) return;
    setSaving(true);
    try {
      await store.requestAll({ type: "config.set", patch: { name: clean } });
      await Promise.all(homes.map((h) => store.refresh(h.homeId)));
      toast(t("desktop.prefs.general.saved"));
    } catch {
      toast(t("desktop.common.error"), "alert");
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    if (!leaving) return;
    const org = orgName(leaving);
    setBusy(true);
    try {
      await store.request(leaving.homeId, { type: "unpair" }).catch(() => {});
      await store.removeHome(leaving.homeId);
      toast(t("desktop.prefs.general.left", { org }));
      setLeaving(null);
    } catch {
      toast(t("desktop.common.error"), "alert");
    } finally {
      setBusy(false);
    }
  };

  // Open at login has an ⓘ only where it changes something: agentes.chat running here, or agents working here.
  const launchHint = local.run || works;
  const launchRow = (
    <PrefRow
      title={t("desktop.prefs.general.launchTitle")}
      hint={
        launchHint
          ? hintFor(t, t("desktop.prefs.general.launchTitle"), t("desktop.prefs.general.launchWork"))
          : undefined
      }
      htmlFor="launch"
      end={
        <Switch
          id="launch"
          aria-describedby={launchHint ? "launch-hint" : undefined}
          checked={launch === true}
          disabled={launch === null}
          onCheckedChange={(on) => {
            setLaunch(on);
            host.setAutostart(on).catch(() => {
              setLaunch(!on);
              toast(t("desktop.common.error"), "alert");
            });
          }}
        />
      }
    />
  );

  return (
    <>
      <PrefHead title={t("desktop.prefs.general.title")} />

      {agentsCard && (
        <ThisMacCards
          homes={homes}
          offers={offers}
          onLeave={setLeaving}
          top={
            works && (
              <PrefRow
                lead={<MacPortrait state={macStateOf(homes)} />}
                title={t("desktop.prefs.general.name")}
                htmlFor="machine-name"
                end={
                  <form
                    className="dk-inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveName();
                    }}
                  >
                    <Input
                      id="machine-name"
                      value={name}
                      maxLength={64}
                      aria-label={t("desktop.prefs.general.nameLabel")}
                      onChange={(e) => setName(e.target.value)}
                    />
                    {name.trim() && name.trim() !== current && (
                      <Button type="submit" size="sm" loading={saving}>
                        {t("desktop.prefs.general.save")}
                      </Button>
                    )}
                  </form>
                }
              />
            )
          }
          bottom={launchRow}
        />
      )}

      <CardTitle>{t("desktop.prefs.general.behavior")}</CardTitle>
      <PrefCard>
        <PrefRow
          title={t("shell.language")}
          htmlFor="language"
          end={
            <Select
              id="language"
              size="sm"
              align="end"
              // Never picked: the system's language shows as the one chosen (and keeps following it until a pick).
              value={language === "auto" ? detectedLocale() : language}
              onValueChange={(v) => {
                setLanguage(v);
                switchDesktopLocale(i18n, v, host.platform);
              }}
              options={locales.map((l) => ({ value: l.code, label: l.label }))}
            />
          }
        />
        {!agentsCard && launchRow}
        <PrefRow
          title={t("desktop.prefs.general.notifySiteTitle")}
          hint={hintFor(t, t("desktop.prefs.general.notifySiteTitle"), t("desktop.prefs.general.notifySiteDesc"))}
          htmlFor="notify-site"
          end={
            <Switch
              id="notify-site"
              aria-describedby="notify-site-hint"
              checked={notifySite}
              onCheckedChange={(on) => {
                setNotifySite(on);
                void host.setSiteNotify(on).catch(() => {});
              }}
            />
          }
        />
        {works && (
          <>
            <PrefRow
              title={t("desktop.prefs.general.notifyTitle")}
              htmlFor="notify"
              end={<Switch id="notify" checked={notify} onCheckedChange={setNotify} />}
            />
            <PrefRow
              title={t("desktop.prefs.general.notifyBrowserTitle")}
              hint={hintFor(
                t,
                t("desktop.prefs.general.notifyBrowserTitle"),
                t("desktop.prefs.general.notifyBrowserDesc"),
              )}
              htmlFor="notify-browser"
              end={
                <Switch
                  id="notify-browser"
                  aria-describedby="notify-browser-hint"
                  checked={notifyBrowser}
                  onCheckedChange={setNotifyBrowser}
                />
              }
            />
          </>
        )}
        {mac && (
          <PrefRow
            title={t("desktop.prefs.general.menuBarTitle")}
            htmlFor="menu-bar"
            end={<Switch id="menu-bar" checked={iconShown} onCheckedChange={setMenuBar} />}
          />
        )}
        {mac && works && (
          <PrefRow
            title={t("desktop.prefs.general.notchTitle")}
            hint={hintFor(t, t("desktop.prefs.general.notchTitle"), t("desktop.prefs.general.notchDesc"))}
            htmlFor="notch"
            end={
              <Switch
                id="notch"
                aria-describedby="notch-hint"
                checked={notch}
                onCheckedChange={(on) => {
                  setNotch(on);
                  host.setNotch(on).catch(() => {
                    setNotch(!on);
                    toast(t("desktop.common.error"), "alert");
                  });
                }}
              />
            }
          />
        )}
      </PrefCard>

      <Dialog
        open={!!leaving}
        onOpenChange={(open) => !open && !busy && setLeaving(null)}
        title={t("desktop.prefs.general.leaveTitle", { org: leaving ? orgName(leaving) : "" })}
        description={t("desktop.prefs.general.leaveBody", { org: leaving ? orgName(leaving) : "" })}
        closeLabel={t("desktop.common.close")}
        width={440}
      >
        <DialogFooter bar>
          <Button variant="ghost" onClick={() => setLeaving(null)} disabled={busy}>
            {t("desktop.common.cancel")}
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void leave()}>
            {t("desktop.prefs.general.leaveConfirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
