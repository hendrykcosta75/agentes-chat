import { useAuthConfig, useIssues, useMe, useOverview } from "@agenteschat/client";
import { showsAbout } from "@agenteschat/client/lib/about";
import { isPersonal, modeKey } from "@agenteschat/client/lib/workspace-mode";
import { isAppLocale, localeInfo, readyLocales } from "@agenteschat/i18n/locale";
import Constants from "expo-constants";
import { useHeaderHeight } from "expo-router/react-navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signOut } from "@/features/account";
import { type SoundChoice, setSoundChoice, useSoundChoice } from "@/lib/sounds";
import { useOrg } from "@/providers/org";
import { WorkspaceSky } from "@/sky/Sky";
import {
  GroupedFooter,
  GroupedHeader,
  GroupedList,
  GroupedRow,
  Icon,
  PersonAvatar,
  PixelOrbit,
  SCREEN_X,
  Text,
  type ThemePreference,
  useTheme,
  WithPresence,
} from "@/ui";
import { CoverBarBackdrop, useCoverScroll } from "@/ui/cover";
import { router } from "@/ui/navigation";
import { AgentFace } from "../shared/Face";
import { useColors, useDirectory, useMeId } from "../shared/hooks";
import { agentLook } from "../shared/logic";
import { pickOne } from "../shared/PickerSheet";
import { goBack, MentionCount, PushedHeader } from "../shared/parts";
import { usePersonPhoto } from "../shared/photo";
import { useTasksUnreadMarks, useUnreadThreads } from "../shared/queries";
import { useMyPerson, usePresenceOf } from "../status/hooks";
import { personLine } from "../status/logic";
import { openStatus } from "../status/StatusScreen";
import { AppIconPicture, useAppIconName } from "./AppIconPage";
import { useAppIcon } from "./app-icon";
import { openIssuesWithMe, workspacesBeyond } from "./logic";
import { useLanguageChoice, usePushSwitch, useSoundLabel, useStartLabel } from "./PreferencePages";
import { useChangePhoto } from "./parts";
import { useWorkspacesAcross, WorkspaceMark } from "./WorkspacesPages";

/** The rows of Você's Work group. */
type WorkRow = "issues" | "proposals" | "routines" | "wiki" | "drive" | "dashboards" | "memory" | "threads" | "team";
/** A team's workspace: Threads is a tab and Team a row of Agents. */
const TEAM_WORK: WorkRow[] = ["issues", "proposals", "routines", "wiki", "drive", "dashboards", "memory"];
/**
 * A personal workspace (ADR 0159): what its sidebar keeps in sight first, then the rest of its More; Threads (no tab
 * there) and Team (no row in Agents) live here, Team last.
 */
const PERSONAL_WORK: WorkRow[] = [
  "routines",
  "drive",
  "issues",
  "threads",
  "proposals",
  "wiki",
  "dashboards",
  "memory",
  "team",
];

/** Opens a screen over this page with the platform's push (back comes here). */
const open = (href: string) => router.push(href as never);

/** The agents of yours Você lists before "Ver todos". */
const AGENTS_SHOWN = 3;
/** Your photo on the cover, unframed (framed faces stop at 52). */
const PHOTO = 96;
/** The photo badge on its top corner and its glyph; its center sits on the photo's ring at 45°. */
const PHOTO_BADGE = 30;
const PHOTO_BADGE_ICON = 14;
const PHOTO_BADGE_AT = ((PHOTO + 6) / 2) * (1 - Math.SQRT1_2) - PHOTO_BADGE / 2;
/** How far the photo hangs below the sky. */
const PHOTO_OVERLAP = 48;
/** Your agents on the sky's horizon beside your photo: two on each side, unframed (the 24 size). */
const HORIZON = 4;
const HORIZON_FACE = 24;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** They rise onto the horizon once a session (the first Você opened), then simply stand there. */
let horizonArrived = false;

/**
 * Você, pushed from your avatar, as the phone's own settings: the bar reads "Você" with Editar on the right; the
 * workspace's sky as a band with your photo hanging from it (a tap changes it), your name, your @ and workspace; then
 * grouped lists on the grouped gray, one value per row. Status first (ADR 0084). The workspace as one row: where you
 * are, how many more and the unread elsewhere, opening the list by server (ADR 0154), with the workspace's settings
 * under it. Your agents, alive (a working one says what it does), "Ver todos" to the Agentes tab. Your work (Tarefas,
 * Propostas, Rotinas, Wiki, Drive, Painéis, Memória): what belongs to the workspace lives in Configurações, once. The
 * preferences; Sons and Aparência change in their row through the system's choice on iOS (a screen on Android, whose
 * dialog holds three buttons at most). Sair alone in red; the version is in Sobre. A settings page is opened many
 * times a day, so nothing here animates beyond the rows' press highlight and the platform's push. A personal workspace
 * (ADR 0159) is yours: no workspace name after your @, your face as its mark, and its work led by what its sidebar
 * keeps in sight (Routines, Drive), with Threads (no tab there) and Team (no row in Agents) in it.
 */
export function MeScreen() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const meId = useMeId();
  const org = useOrg();
  const personal = isPersonal(org.org);
  const { groups, elsewhere } = useWorkspacesAcross();
  const theme = useTheme();
  const appIcon = useAppIcon();
  const appIconName = useAppIconName(appIcon.icon ?? "night");
  const dir = useDirectory();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  // The bar is clear over the sky and becomes its own once the page scrolls under it (as an agent's page).
  const { y, onScroll } = useCoverScroll();
  const issues = useIssues(org.orgId);
  const proposals = useOverview(org.orgId).data?.proposalsWaitingForMe ?? 0;
  const push = usePushSwitch().on;
  const about = showsAbout(useAuthConfig().data);
  const mine = meId ? dir.memberById.get(meId) : undefined;
  // How you appear (to yourself: hidden stays hidden), on your photo's corner (ADR 0084).
  const myPresence = useMyPerson()?.presence;
  const name = me.data?.user.name ?? "";
  const photo = usePersonPhoto(mine?.avatarUrl ?? mine?.image ?? me.data?.user.image);
  const { changePhoto, uploading } = useChangePhoto();
  const sounds = useSoundChoice();
  const language = useLanguageChoice();
  const styleLabel = useSoundLabel();
  const startLabel = useStartLabel();
  const withMe = openIssuesWithMe(issues.data, meId);
  // Mentions of me not read in a task's conversation: the red badge before the value, as on Conversas.
  const tasksUnread = useTasksUnreadMarks();
  // Threads with something new, the badge their tab has in a team's workspace.
  const unreadThreads = useUnreadThreads();
  const version = Constants.expoConfig?.version ?? "";
  const myAgents = dir.agents.filter((a) => a.ownerUserId === meId);
  const handle = mine?.handle ? `@${mine.handle}` : null;
  // A personal workspace's name ("Personal") says nothing after your @.
  const headline = [handle, personal ? null : org.org?.name].filter(Boolean).join(" · ");
  const role = org.org ? t(modeKey(org.org, `mobile.me.role.${org.org.role}`)) : "";
  const beyond = workspacesBeyond(groups, org.orgId);
  const workspaceSub =
    beyond.others === 0
      ? role
      : beyond.servers === 0
        ? t("mobile.me.workspaceMore", { count: beyond.others })
        : beyond.servers === 1
          ? t("mobile.me.workspaceMoreElsewhere", { count: beyond.others })
          : t("mobile.me.workspaceMoreServers", { count: beyond.others });
  // Your work's rows, in the order of the workspace's mode (`TEAM_WORK`, `PERSONAL_WORK`).
  const work: Record<WorkRow, ReactNode> = {
    issues: (
      <GroupedRow
        key="issues"
        icon="checkc"
        label={t("mobile.me.issues")}
        {...(withMe > 0 ? { value: t("mobile.me.issuesWithMe", { count: withMe }) } : {})}
        {...(tasksUnread.mentions > 0 ? { valueLeading: <MentionCount count={tasksUnread.mentions} /> } : {})}
        chevron
        onPress={() => open("/issues")}
      />
    ),
    proposals: (
      <GroupedRow
        key="proposals"
        icon="flag"
        label={t("shell.proposals")}
        {...(proposals > 0 ? { value: t("mobile.me.proposalsWaiting", { count: proposals }) } : {})}
        chevron
        onPress={() => open("/proposals")}
      />
    ),
    routines: (
      <GroupedRow key="routines" icon="clock" label={t("routines.title")} chevron onPress={() => open("/routines")} />
    ),
    wiki: <GroupedRow key="wiki" icon="file" label={t("wiki.title")} chevron onPress={() => open("/wiki")} />,
    drive: <GroupedRow key="drive" icon="doc" label={t("mobile.me.drive")} chevron onPress={() => open("/drive")} />,
    dashboards: (
      <GroupedRow
        key="dashboards"
        icon="chart"
        label={t("mobile.me.dashboards")}
        chevron
        onPress={() => open("/dashboards")}
      />
    ),
    memory: (
      <GroupedRow key="memory" icon="brain" label={t("mobile.memory.title")} chevron onPress={() => open("/memory")} />
    ),
    // The tab's list, pushed: a tab left out of the bar can't be opened.
    threads: (
      <GroupedRow
        key="threads"
        icon="reply"
        label={t("mobile.threads.title")}
        {...(unreadThreads > 0 ? { value: String(unreadThreads) } : {})}
        chevron
        onPress={() => open("/conversations/threads")}
      />
    ),
    team: <GroupedRow key="team" icon="members" label={t("team.title")} chevron onPress={() => open("/team")} />,
  };
  const soundValue = sounds === "off" ? t("mobile.me.soundsOff") : styleLabel(sounds);
  const themeValue = t(`mobile.theme.${theme.preference}`);

  // Sons, Aparência and Idioma change in their row through the app's picker (the one in use checked, the languages
  // searchable), never a screen of their own for one pick.
  const pickSound = () => {
    const choices: SoundChoice[] = ["tactile", "sky", "pixel", "off"];
    void pickOne({
      title: t("mobile.me.sounds"),
      value: sounds,
      options: choices.map((choice) => ({
        key: choice,
        label: choice === "off" ? t("mobile.me.soundsOff") : styleLabel(choice),
      })),
    }).then((key) => {
      if (key) setSoundChoice(key as SoundChoice);
    });
  };
  const pickTheme = () => {
    const choices: ThemePreference[] = ["system", "light", "dark"];
    void pickOne({
      title: t("mobile.me.appearance"),
      value: theme.preference,
      options: choices.map((choice) => ({ key: choice, label: t(`mobile.theme.${choice}`) })),
    }).then((key) => {
      if (key) theme.setPreference(key as ThemePreference);
    });
  };
  const pickLanguage = () =>
    void pickOne({
      title: t("mobile.me.language"),
      value: language.choice,
      options: readyLocales().map((l) => ({ key: l.code, label: l.native })),
      search: true,
    }).then((key) => {
      if (key) language.pick(key as Parameters<typeof language.pick>[0]);
    });
  const confirmSignOut = () =>
    Alert.alert(t("mobile.me.signOutConfirm"), t("mobile.me.signOutConfirmText"), [
      { text: t("mobile.common.cancel"), style: "cancel" },
      {
        text: t("mobile.me.signOut"),
        style: "destructive",
        onPress: () => {
          goBack();
          void signOut();
        },
      },
    ]);

  return (
    <View style={[styles.fill, { backgroundColor: c.grouped }]}>
      <PushedHeader
        title={t("mobile.me.title")}
        plate
        solid={false}
        grouped
        action={{ label: t("mobile.me.edit"), onPress: () => open("/me/account") }}
      />
      <Animated.ScrollView
        style={styles.fill}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* The workspace's sky as a band under the clear bar; your photo hangs from its bottom edge. */}
        <View style={[styles.band, { height: insets.top + 62 + PHOTO_OVERLAP }]}>
          <WorkspaceSky fade={0.4} style={StyleSheet.absoluteFill} />
          <HorizonTeam ids={myAgents.slice(0, HORIZON).map((a) => a.id)} />
        </View>
        <View style={styles.cover}>
          <Pressable
            onPress={changePhoto}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel={t("mobile.me.account.changePhoto")}
            style={({ pressed }) => (pressed || uploading ? styles.pressed : null)}
          >
            <WithPresence size={PHOTO + 6} presence={myPresence} ring={c.grouped}>
              <View style={[styles.ring, { borderColor: c.grouped }]}>
                <PersonAvatar name={name || "?"} size={PHOTO} photo={photo} />
              </View>
            </WithPresence>
            {/* A touch screen has no hover: the photo badge says the face changes it (presence keeps its corner). */}
            <View
              style={[styles.photoBadge, { backgroundColor: c.action, borderColor: c.grouped }]}
              pointerEvents="none"
            >
              <Icon name="image" size={PHOTO_BADGE_ICON} color={c.onAction} />
            </View>
          </Pressable>
          <Text variant="display2" style={styles.center}>
            {name}
          </Text>
          {headline ? (
            <Text variant="subhead" tone="muted" style={styles.center}>
              {headline}
            </Text>
          ) : null}
        </View>

        <View style={styles.groups}>
          <GroupedHeader>{t("mobile.me.status")}</GroupedHeader>
          <GroupedList>
            <StatusRow />
          </GroupedList>

          <GroupedHeader>{t("mobile.me.workspace")}</GroupedHeader>
          <GroupedList>
            {org.org ? (
              <GroupedRow
                key="workspace"
                leading={<WorkspaceMark org={org.org} size={36} />}
                label={org.org.name}
                sub={workspaceSub}
                // What's unread in the other workspaces (ADR 0154).
                {...(elsewhere > 0 ? { value: String(elsewhere) } : {})}
                chevron
                onPress={() => open("/me/workspaces")}
              />
            ) : null}
            <GroupedRow
              key="settings"
              icon="home"
              label={t("settings.title")}
              chevron
              onPress={() => open("/settings")}
            />
          </GroupedList>

          {myAgents.length > 0 ? (
            <>
              <GroupedHeader>{`${t("mobile.me.yourAgents")} · ${myAgents.length}`}</GroupedHeader>
              <GroupedList>
                {myAgents.slice(0, AGENTS_SHOWN).map((a) => (
                  <AgentRow key={a.id} agentId={a.id} name={a.name} role={a.role} />
                ))}
                {myAgents.length > AGENTS_SHOWN ? (
                  <GroupedRow
                    key="all"
                    icon="list"
                    label={t("mobile.me.allAgents")}
                    chevron
                    onPress={() => router.navigate("/agents" as never)}
                  />
                ) : null}
              </GroupedList>
            </>
          ) : null}

          <GroupedHeader>{t("mobile.me.work")}</GroupedHeader>
          <GroupedList>{(personal ? PERSONAL_WORK : TEAM_WORK).map((key) => work[key])}</GroupedList>

          <GroupedHeader>{t("mobile.me.preferences")}</GroupedHeader>
          <GroupedList>
            <GroupedRow
              key="notifications"
              icon="bell"
              label={t("mobile.me.notifications")}
              {...(push === null ? {} : { value: push ? t("mobile.me.on") : t("mobile.me.off") })}
              chevron
              onPress={() => open("/me/notifications")}
            />
            {/* Who approves for me, and whom I approve for (ADR 0139); a personal workspace lists it in Settings ›
                Advanced instead (ADR 0159 §3). */}
            {personal ? null : (
              <GroupedRow
                key="approvals"
                icon="shield"
                label={t("settings.section.approvals")}
                chevron
                onPress={() => open("/me/approvals")}
              />
            )}
            {/* A server from before the choice sends none and can't keep one (`PUT …/me/start` answers 404). */}
            {org.org?.start !== undefined ? (
              <GroupedRow
                key="start"
                icon="home"
                label={t("mobile.me.start")}
                value={startLabel}
                chevron
                onPress={() => open("/me/start")}
              />
            ) : null}
            {/* Likewise: a server from before the choice sends no `showActivity`. */}
            {org.org?.showActivity !== undefined ? (
              <GroupedRow
                key="activity"
                icon="eye"
                label={t("mobile.me.activity")}
                value={org.org.showActivity ? t("mobile.me.on") : t("mobile.me.off")}
                chevron
                onPress={() => open("/me/activity")}
              />
            ) : null}
            {/* Likewise: a server from before the choice sends no `chatPrefs`. */}
            {org.org?.chatPrefs !== undefined ? (
              <GroupedRow
                key="chat"
                icon="text"
                label={t("settings.account.chat.title")}
                chevron
                onPress={() => open("/me/chat-look")}
              />
            ) : null}
            {/* Likewise: a server from before the choice sends no `agentStyle` (ADR 0147). */}
            {org.org?.agentStyle !== undefined ? (
              <GroupedRow
                key="agentStyle"
                icon="agent"
                label={t("mobile.me.agentStyle")}
                value={
                  org.org.agentStyle === "technical"
                    ? t("settings.account.agentStyleTechnical")
                    : t("settings.account.agentStyleSimple")
                }
                chevron
                onPress={() => open("/me/agent-style")}
              />
            ) : null}
            <GroupedRow
              key="sounds"
              icon="sound"
              label={t("mobile.me.sounds")}
              value={soundValue}
              menu
              onPress={pickSound}
            />
            <GroupedRow
              key="appearance"
              icon={theme.scheme === "dark" ? "moon" : "sun"}
              label={t("mobile.me.appearance")}
              value={themeValue}
              menu
              onPress={pickTheme}
            />
            {/* The app icon (ADR 0179): only where this build carries the others. */}
            {appIcon.supported && appIcon.icon ? (
              <GroupedRow
                key="appIcon"
                leading={<AppIconPicture icon={appIcon.icon} />}
                label={t("appIcon.title")}
                value={appIconName}
                chevron
                onPress={() => open("/me/app-icon")}
              />
            ) : null}
            <GroupedRow
              key="language"
              icon="globe"
              label={t("mobile.me.language")}
              value={isAppLocale(i18n.language) ? localeInfo(i18n.language).native : i18n.language}
              menu
              onPress={pickLanguage}
            />
            {about ? (
              <GroupedRow
                key="about"
                icon="info"
                label={t("settings.section.about")}
                chevron
                onPress={() => open("/me/about")}
              />
            ) : null}
          </GroupedList>

          <View style={styles.gapBig} />
          <GroupedList>
            <GroupedRow key="signOut" label={t("mobile.me.signOut")} danger onPress={confirmSignOut} />
          </GroupedList>
          {/* Sobre says the version; without it (a server that hides it), the version stays here. */}
          {!about && version ? <GroupedFooter>{t("mobile.me.version", { version })}</GroupedFooter> : null}
        </View>
      </Animated.ScrollView>
      <CoverBarBackdrop y={y} from={0} to={12} height={headerHeight} />
    </View>
  );
}

/** Your status as a row (ADR 0084): "Definir status" or how you appear, with when it clears; a tap pushes Status. */
function StatusRow() {
  const { t, i18n } = useTranslation();
  const me = useMyPerson();
  const presence = me?.presence ?? "offline";
  const status = me?.status ?? null;
  const label = status
    ? personLine(t, i18n.language || "en", status)
    : presence === "online"
      ? t("presence.setStatus")
      : t(`presence.${presence}`);
  return <GroupedRow icon="smile" label={label} chevron onPress={openStatus} />;
}

/**
 * Your agents standing on the sky's horizon, either side of your photo, alive (blinking, looking around, the one at
 * work running): the page is yours and so are they. The first time Você opens in a session they rise onto it in one
 * wave (the nearest first), a rare moment; after that they are just there. Reduced motion: a fade, no rise.
 */
function HorizonTeam({ ids }: { ids: string[] }) {
  const { reducedMotion } = useTheme();
  const presence = usePresenceOf();
  const [rise] = useState(() => !horizonArrived);
  useEffect(() => {
    horizonArrived = true;
  }, []);
  if (ids.length === 0) return null;
  // Alternate sides from the photo outward: 0 and 1 nearest, 2 and 3 beyond them.
  const left = ids.filter((_, i) => i % 2 === 0).reverse();
  const right = ids.filter((_, i) => i % 2 === 1);
  const enter = (i: number) =>
    !rise
      ? undefined
      : reducedMotion
        ? FadeIn.duration(200)
        : FadeInUp.duration(420)
            .delay(160 + i * 60)
            .easing(EASE_OUT)
            .withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });
  const face = (id: string) => (
    <Animated.View key={id} entering={enter(ids.indexOf(id))}>
      <AgentFace
        agentId={id}
        size={HORIZON_FACE}
        framed={false}
        mode={presence.agent(id)?.presence === "working" ? "run" : "idle"}
      />
    </Animated.View>
  );
  return (
    <View
      style={styles.horizon}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.side, styles.sideLeft]}>{left.map(face)}</View>
      <View style={styles.photoGap} />
      <View style={styles.side}>{right.map(face)}</View>
    </View>
  );
}

/** One of your agents: its face in its sky at 36, its name, what it does now (its orbit turning) or its role. */
function AgentRow({ agentId, name, role }: { agentId: string; name: string; role: string | null | undefined }) {
  const dir = useDirectory();
  const shown = usePresenceOf().agent(agentId);
  const working = shown?.presence === "working" && shown.line ? shown.line.text : null;
  const look = agentLook(dir.agentById.get(agentId));
  return (
    <GroupedRow
      leading={<AgentFace agentId={agentId} size={36} />}
      label={name}
      {...(working ? { below: <WorkingLine color={look.color} text={working} /> } : role ? { sub: role } : {})}
      chevron
      onPress={() => open(`/agent/${agentId}`)}
    />
  );
}

/** What a working agent does, in words with its orbit, never a label. */
function WorkingLine({ color, text }: { color: Parameters<typeof PixelOrbit>[0]["color"]; text: string }) {
  return (
    <View style={styles.working}>
      <PixelOrbit color={color} size={11} />
      <Text variant="footnote" tone="ink2" numberOfLines={1} style={styles.shrink}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  band: { overflow: "hidden" },
  // The team stands on the band's bottom edge (the horizon), the photo's width (and its ring) kept clear between them.
  horizon: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  side: { flex: 1, flexDirection: "row", gap: 16 },
  sideLeft: { justifyContent: "flex-end" },
  photoGap: { width: PHOTO + 6 + 40 },
  cover: { alignItems: "center", gap: 6, marginTop: -PHOTO_OVERLAP, paddingHorizontal: 16 },
  // A ring in the page's color lifts the photo off the sky.
  ring: { borderRadius: 999, borderWidth: 3 },
  pressed: { opacity: 0.6 },
  photoBadge: {
    position: "absolute",
    top: PHOTO_BADGE_AT,
    right: PHOTO_BADGE_AT,
    width: PHOTO_BADGE,
    height: PHOTO_BADGE,
    borderRadius: PHOTO_BADGE / 2,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { textAlign: "center" },
  groups: { paddingHorizontal: SCREEN_X, paddingTop: 4 },
  gapBig: { height: 24 },
  working: { flexDirection: "row", alignItems: "center", gap: 4 },
  shrink: { flexShrink: 1, minWidth: 0 },
});
