import { type AiStatus, keys, type Me, useApi } from "@agenteschat/client";
import { type PushOfferMoment, pushOfferDue, pushOffersFrom } from "@agenteschat/client/lib/push-offer";
import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState } from "react-native";
import { registerDeviceActions, runDeviceAction } from "@/features/devices/push";
import { hrefForPush, notificationWebPath, pushAsNotification } from "@/features/links/logic";
import { openWebPath } from "@/features/links/open-web";
import { openWorkspace } from "@/features/server";
import { pushOpens } from "@/lib/org-choice";
import {
  configureForegroundPush,
  ensureAndroidChannel,
  type PushPermission,
  pushPermission,
  pushTurnedOff,
  registerForPush,
  watchPushToken,
} from "@/lib/push";
import { readPushData } from "@/lib/push-payload";
import { placeAccounts, placeKey, signedInServers } from "@/lib/server";
import { pushPlace } from "@/lib/server-choice";
import { readValueSync, STORED, writeValue } from "@/lib/storage";
import { router } from "@/ui/navigation";
import { useOrgMaybe } from "./org";

interface PushApi {
  /** The system's prompt now (from our sheet, or Você › Avisos); whether this phone got registered. */
  ask: () => Promise<boolean>;
  /** Whether our sheet should open by itself at each moment (Conversas decides when it shows). */
  offer: Record<PushOfferMoment, boolean>;
  /** Our sheet opened by itself: counted, so it doesn't open again for the same moment. */
  markOffered: () => void;
}

const PushContext = createContext<PushApi>({
  ask: async () => false,
  offer: { answer: false, approval: false },
  markOffered: () => {},
});

configureForegroundPush();

/** Notifications already opened (the launch one must not reopen when the provider remounts). */
const opened = new Set<string>();

/** A tapped push from another server: opened once the app is on that server (ADR 0154). */
let afterSwitch: Notifications.NotificationResponse | null = null;

/**
 * Push for a signed-in person with an organization: registers silently when already allowed, says when our
 * sheet should come before the system's prompt (`@agenteschat/client/lib/push-offer`; never at launch, never inside a
 * conversation: Conversas opens it), and opens what a tapped notification is about.
 */
export function PushProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const org = useOrgMaybe();
  const ready = Boolean(org);
  const setOrgId = org?.setOrgId;
  const setOrgRef = useRef(setOrgId);
  setOrgRef.current = setOrgId;
  const locale = i18n.language;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const api = useApi();
  const qc = useQueryClient();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [turnedOff, setTurnedOff] = useState(false);
  const [offers, setOffers] = useState(() =>
    pushOffersFrom(readValueSync(STORED.pushOffers), readValueSync(STORED.pushAsked) === "1"),
  );

  const ask = useCallback(async () => {
    const ok = await registerForPush({ ask: true, locale });
    setPermission(await pushPermission());
    setTurnedOff(await pushTurnedOff());
    return ok;
  }, [locale]);

  const markOffered = useCallback(() => {
    setOffers((n) => n + 1);
  }, []);
  useEffect(() => {
    void writeValue(STORED.pushOffers, String(offers));
  }, [offers]);

  // Register when already allowed; read what the phone allows again when the app comes back to the front
  // (Ajustes may have changed it), registering if it became allowed there.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let was: PushPermission | null = null;
    void ensureAndroidChannel(t("mobile.push.channel"), t("mobile.push.channelDescription"));
    const check = async () => {
      const now = await pushPermission();
      const off = await pushTurnedOff();
      if (!alive) return;
      setPermission(now);
      setTurnedOff(off);
      if (now === "granted" && was !== "granted" && !off) await registerForPush({ ask: false, locale });
      was = now;
    };
    void check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [ready, locale, t]);

  // A device notification's buttons on the lock screen, in the person's language.
  useEffect(() => {
    if (ready) void registerDeviceActions(t);
  }, [ready, t]);

  // The system may hand the app a new token while it runs; it's registered again (ADR 0152, ADR 0178).
  useEffect(() => {
    if (!ready) return;
    return watchPushToken(() => localeRef.current);
  }, [ready]);

  // A tapped notification opens its screen (after switching to its organization).
  useEffect(() => {
    if (!ready) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (opened.has(id)) return;
      opened.add(id);
      const data = readPushData(response.notification.request.content.data);
      // From another server this phone is signed in to: the app moves there first, then opens it (ADR 0154). One
      // from a server it left opens nothing.
      // And as the account it is for, where this phone has several on that server (ADR 0183).
      const place = pushPlace(data.server, placeKey(), signedInServers(), {
        user: data.user,
        accounts: placeAccounts(),
      });
      if (place.kind === "gone") return;
      if (place.kind === "switch") {
        afterSwitch = response;
        opened.delete(id);
        void openWorkspace(place.server, data.orgId ?? null);
        return;
      }
      const orgId = data.orgId;
      if (orgId && !pushOpens(qc.getQueryData<Me | null>(keys.me)?.organizations ?? [], orgId)) return;
      if (orgId) setOrgRef.current?.(orgId);
      // A button pressed on the notification (Stop, Let it join…): done first, then its screen opens as a tap would.
      if (orgId && response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        runDeviceAction(api, orgId, data, response.actionIdentifier);
      // The computer being ready opens Connect an AI while no agent has one: its AI status is asked first.
      const ai: Promise<AiStatus | undefined> =
        data.kind === "computer_ready" && orgId
          ? qc
              .fetchQuery({
                queryKey: keys.aiStatus(orgId),
                queryFn: () => api.agents.aiStatus(orgId),
                staleTime: 30_000,
              })
              .catch(() => undefined)
          : Promise.resolve(undefined);
      void ai.then((status) => {
        const href = hrefForPush(data, status);
        // No screen of its own in the app (the workspace's billing hold): its page on the web, in the in-app browser.
        const web = href || !orgId ? null : notificationWebPath(pushAsNotification(data), orgId);
        setTimeout(() => (web ? openWebPath(web) : router.push(href ?? "/activity")), 0);
      });
    };
    if (afterSwitch) {
      const waiting = afterSwitch;
      afterSwitch = null;
      open(waiting);
    }
    try {
      open(Notifications.getLastNotificationResponse());
    } catch {
      // No launch notification.
    }
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready, api, qc]);

  const value = useMemo<PushApi>(() => {
    const state = { permission, turnedOff, offers };
    return {
      ask,
      offer: { answer: pushOfferDue(state, "answer"), approval: pushOfferDue(state, "approval") },
      markOffered,
    };
  }, [ask, markOffered, permission, turnedOff, offers]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

/** `usePush()`: the system's prompt (`ask`) and when our sheet should open by itself (`offer`). */
export const usePush = () => useContext(PushContext);
