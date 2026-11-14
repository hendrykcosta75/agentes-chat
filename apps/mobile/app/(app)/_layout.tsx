import { usePrefetchRecent, useSendWaiting } from "@agenteschat/client";
import { errorText } from "@agenteschat/client/lib/errors";
import { type ErrorBoundaryProps, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { NoticeIsland } from "@/features/island/NoticeIsland";
import { ShareInbox } from "@/features/share/ShareInbox";
import { useConnection, useRememberAgentLooks } from "@/features/shared/hooks";
import { useAppIconBadge } from "@/features/shared/queries";
import { ScreenError } from "@/features/shared/ScreenError";
import { useUserEvents } from "@/features/shared/userEvents";
import { useVaultEvents } from "@/features/vault/live";
import { useVoiceOutbox } from "@/features/voice/useVoiceOutbox";
import { useSounds } from "@/lib/sounds";
import { useOrg, useOrgGate } from "@/providers/org";
import {
  coverBarOptions,
  useFormSheetOptions,
  usePushedOptions,
  useScrollUnderPushedOptions,
  useTheme,
  useToast,
} from "@/ui";

/** A link straight to a pushed screen or a sheet still has the tabs under it (the back button works). */
export const unstable_settings = { anchor: "(tabs)" };

/** A screen that breaks while drawing shows what happened and a way back, instead of closing the app. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ScreenError {...props} />;
}

/**
 * The signed-in app: the native tabs, and the screens pushed over them with the platform's push (the tab
 * bar hides there; the native back button and the edge swipe go back), Você and its screens among them, and "New"
 * (the "+" of the tabs). Requests and the forms "New" opens are native form sheets over whatever is on screen.
 * Header options are set here so the first frame of a push already has its bar; `PushedHeader` fills in
 * the title and actions.
 */
export default function AppLayout() {
  const { colors } = useTheme();
  const org = useOrgGate();
  // Signed in, the organization not known yet (the splash or `Entering` covers this) or none (the first run, `OnboardingFlow`, covers it):
  // the screens need one, so they mount once it's chosen, at the URL the app opened with.
  if (!org.state) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <>
      <AppStack />
      {/* What reaches me while the app is open, out of the camera's island (ADR 0071 §9). */}
      <NoticeIsland />
      {/* What other apps share through the system's share sheet opens "Compartilhar com…". */}
      <ShareInbox />
    </>
  );
}

function AppStack() {
  const { colors } = useTheme();
  useUserEvents();
  // The Vault's screens follow changes made anywhere (ADR 0144).
  useVaultEvents();
  useVoiceOutbox();
  useAppIconBadge();
  // The app's sounds (ADR 0070): the player and its audio session.
  useSounds();
  useRememberAgentLooks();
  const { orgId } = useOrg();
  // The unread and latest conversations load while the app is idle: opening them is instant.
  usePrefetchRecent(orgId);
  // What I sent while the connection was down goes out once it's back, whatever screen is open.
  const { t, i18n } = useTranslation();
  const toast = useToast();
  useSendWaiting(orgId, useConnection(), (error) => toast({ title: errorText(t, error, i18n.language), icon: "x" }));
  const pushed = usePushedOptions();
  const scrollUnder = useScrollUnderPushedOptions();
  // A request reads as grouped facts (its white groups on the sheet's gray), as the system's own sheets do.
  const approvalSheet = useFormSheetOptions([0.64, 1]);
  const formSheet = useFormSheetOptions([1]);
  const channelSheet = useFormSheetOptions([0.45, 1]);
  const switchSheet = useFormSheetOptions([0.8, 1]);
  const setupSheet = useFormSheetOptions([0.7, 1]);
  const requestsSheet = useFormSheetOptions([0.7, 1]);
  const pushSheet = useFormSheetOptions("fitToContents");
  // The workspaces as a sheet (ADR 0154): tall enough for a few servers, the top detent for many.
  const workspacesSheet = useFormSheetOptions([0.76, 1]);
  const wikiSheet = useFormSheetOptions([0.55, 1]);
  // "New" over the tabs as the system's new message: two thirds at rest, the whole screen once the keyboard is up.
  const newSheet = useFormSheetOptions([0.66, 1]);
  const shareSheet = useFormSheetOptions([0.72, 1]);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, gestureEnabled: true }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[channelId]" options={pushed} />
      {/* Two agents' conversation, read only, over the one it was asked from (the web's dialog). */}
      <Stack.Screen name="consultation/[id]" options={formSheet} />
      <Stack.Screen name="block/[id]" options={pushed} />
      <Stack.Screen name="conversations/[kind]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="channel-category" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="channel-category-new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="sector-new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="sector/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="channel-categories" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="channel-category-edit" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="mission/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent/[id]" options={{ ...pushed, ...coverBarOptions }} />
      <Stack.Screen name="account-delete" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="ai-accounts" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="usage" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-usage/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-ai/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-model/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-advanced/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-more/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-setup/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-step/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-edit" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-delete" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="new" options={newSheet} />
      <Stack.Screen name="share-to" options={shareSheet} />
      <Stack.Screen name="new-agent" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="issues/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="issues/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="issues/new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="drive/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="memory/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="memory/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="wiki/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="wiki/[slug]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="wiki-history" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="wiki-map" options={pushed} />
      <Stack.Screen name="wiki-move" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="wiki-audience" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="who-sees" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="wiki-trash" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="archived-channels" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="wiki-agents" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="wiki-write" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="routines/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="routines/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="routines/new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="routines/zone" options={{ ...pushed, ...scrollUnder }} />
      {/* Dashboards (ADR 0135): every screen pushed with back, never a sheet; the list opens from the home. */}
      <Stack.Screen name="dashboards" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="board/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="board-new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="board-share/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="board-organize/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="board-edit/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="board-edit-roles" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="widget/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="widget-new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-pick" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="widget-pin" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="team" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="proposals" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="task-manager/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="task-manager/[runId]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="agent-tasks/[agentId]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="connectors/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="connectors/tools" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="connectors/[id]" options={{ ...pushed, ...coverBarOptions }} />
      <Stack.Screen
        name="connectors/oauth"
        options={{ animation: "none", contentStyle: { backgroundColor: colors.bg } }}
      />
      <Stack.Screen name="approval/[id]" options={approvalSheet} />
      <Stack.Screen name="join-requests" options={requestsSheet} />
      <Stack.Screen name="switch-computer/[machineId]" options={switchSheet} />
      <Stack.Screen name="computer-setup" options={setupSheet} />
      {/* Connect an AI: pushed screens, one question each, on the grouped gray (its bar counts the steps). */}
      <Stack.Screen
        name="connect-ai"
        options={{ ...pushed, ...scrollUnder, contentStyle: { backgroundColor: colors.grouped } }}
      />
      {/* Você: a pushed page with a clear bar over its sky; its screens pushed over it on the grouped gray. */}
      <Stack.Screen name="me/index" options={{ ...pushed, ...coverBarOptions }} />
      <Stack.Screen name="me/account" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/status" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/zone" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/email" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/workspaces" options={{ ...pushed, ...scrollUnder }} />
      {/* The same list as a sheet, from a long press on the workspace's mark in the bar (ADR 0154). */}
      <Stack.Screen name="workspaces-sheet" options={workspacesSheet} />
      {/* Another workspace (ADR 0154): on a server of one's own a new one there first, then agentes.chat or the team's
          own server; a short sheet fitted to its rows. */}
      <Stack.Screen name="me/add-workspace" options={pushSheet} />
      {/* On the sign-in's ruler: its own sky and back circle, no bar. */}
      <Stack.Screen name="me/team-server" options={{ headerShown: false }} />
      <Stack.Screen name="me/scan" options={{ headerShown: false }} />
      <Stack.Screen name="me/members" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="invite-people" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="invite-channels" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="invite-note" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="suggest-person" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/notifications" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/approvals" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/start" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/activity" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/agent-style" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/chat-look" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/sounds" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/appearance" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/app-icon" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/language" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="me/about" options={{ ...pushed, ...scrollUnder }} />
      {/* The workspace's settings: its page under the sky (from Você), then each section on the grouped gray. */}
      <Stack.Screen name="settings/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/general" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/advanced" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/mode" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/delete" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/right-hand" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/zone" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/telemetry" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/access" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/[roleId]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/permissions" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/who" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/channels" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/channel" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/agents" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/agent" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/people" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/add" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/look" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/rename" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/roles/person" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/skills/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/skills/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/skills/new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/skills/edit" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/devices/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/devices/[machineId]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/devices/phone/[phoneId]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/devices/audience" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/devices/android-setup" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/devices/iphone-setup" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/devices/connect" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/computers/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/computers/[machineId]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/computers/rename" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/computers/folder" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/computers/agent" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/audit/index" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/audit/[id]" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/apps" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/media" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/storage" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/import" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/vault" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/vault-item" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/vault-new" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/vault-env" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/vault-access" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/vault-connect" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="settings/vault-connection" options={{ ...pushed, ...scrollUnder }} />
      <Stack.Screen name="push-ask" options={pushSheet} />
      <Stack.Screen name="wiki-new" options={wikiSheet} />
      <Stack.Screen name="new-channel" options={channelSheet} />
      <Stack.Screen name="new-chat" options={formSheet} />
      <Stack.Screen name="file-share" options={requestsSheet} />
      <Stack.Screen name="code" options={formSheet} />
      <Stack.Screen name="chart" options={formSheet} />
      <Stack.Screen
        name="images"
        options={{
          presentation: "transparentModal",
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      {/* A bare link to a browser request: finds its conversation and replaces itself with it. */}
      <Stack.Screen name="handoff/[id]" options={{ animation: "none", contentStyle: { backgroundColor: colors.bg } }} />
      <Stack.Screen name="link" options={{ animation: "none", contentStyle: { backgroundColor: colors.bg } }} />
      <Stack.Screen
        name="file/[id]"
        options={{ presentation: "fullScreenModal", contentStyle: { backgroundColor: colors.bg } }}
      />
      <Stack.Screen
        name="computer/[agentId]"
        options={{ presentation: "fullScreenModal", contentStyle: { backgroundColor: colors.bg } }}
      />
      <Stack.Screen
        name="browser-profile/[profileId]"
        options={{ presentation: "fullScreenModal", contentStyle: { backgroundColor: colors.bg } }}
      />
    </Stack>
  );
}
