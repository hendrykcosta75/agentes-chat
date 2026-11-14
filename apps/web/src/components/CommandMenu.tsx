import { useAuthConfig, useChannels, useWikiTree } from "@agenteschat/client";
import { AGENT_SECTIONS, AGENT_TABS, PERSONAL_AGENT_TABS } from "@agenteschat/client/lib/agent-edit";
import { canTalk, listsAgent } from "@agenteschat/client/lib/audience";
import { joinable } from "@agenteschat/client/lib/channel-access";
import { setDraftFor } from "@agenteschat/client/lib/drafts";
import { can, makesAgents } from "@agenteschat/client/lib/permissions";
import { settingsSectionNameKey } from "@agenteschat/client/lib/personal-view";
import { isPersonal, modeKey } from "@agenteschat/client/lib/workspace-mode";
import { Avatar, CommandPalette, Icon, type PaletteItem } from "@agenteschat/ui";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useInviteDialog } from "@/components/invite/InviteDialog";
import { NewChannelDialog } from "@/components/NewChannelDialog";
import { useNewAgent } from "@/components/new-agent/NewAgentDialog";
import { useOrg } from "@/components/org-context";
import { MyFace } from "@/components/ProfilePhoto";
import { useDirectory } from "@/hooks/useDirectory";
import { type ThemePreference, useTheme } from "@/lib/theme";
import { SETTINGS_SECTIONS } from "@/pages/settings-sections";

/** ⌘K / Ctrl+K anywhere in the workspace (also when typing): opens the palette. */
export const isPaletteShortcut = (e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">) =>
  (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";

/** Opens the palette from elsewhere (a button). */
export const openPalette = () => window.dispatchEvent(new Event("agentes:palette"));

/**
 * The ⌘K palette: go to any channel, agent, person, page or settings section,
 * change something (the theme, a new channel or agent), or ask an agent (opens
 * its DM with the text in the composer). Typing also finds each agent's own
 * options: its tabs, its settings and "Change AI model".
 */
export function CommandMenu() {
  const { t } = useTranslation();
  const { org, me } = useOrg();
  const dir = useDirectory(org.id);
  const channels = useChannels(org.id);
  const server = useAuthConfig().data;
  const navigate = useNavigate();
  const invite = useInviteDialog();
  const newAgent = useNewAgent();
  const theme = useTheme();
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [open, setOpen] = useState(false);
  // The wiki only when the palette is open (no request on every page).
  const wiki = useWikiTree(org.id, open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("agentes:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("agentes:palette", onOpen);
    };
  }, []);

  const goTo = t("palette.goTo");
  const items = useMemo<PaletteItem[]>(() => {
    const orgId = org.id;
    const list: PaletteItem[] = [];
    for (const c of channels.data ?? []) {
      if (!c.isMember && !joinable(c)) continue;
      list.push({
        key: `c:${c.id}`,
        group: goTo,
        label: `#${c.name}`,
        // A personal workspace calls its channels group conversations (ADR 0159).
        sub: t(modeKey(org, "palette.channel")),
        mark: <Icon name="channel" size={16} />,
        onSelect: () => void navigate({ to: "/org/$orgId/c/$channelId", params: { orgId, channelId: c.id } }),
      });
    }
    for (const a of dir.agents) {
      if (!listsAgent(org, a)) continue;
      list.push({
        key: `a:${a.id}`,
        group: goTo,
        label: a.name,
        sub: a.role ? t("palette.agentRole", { role: a.role }) : t("palette.agent"),
        keywords: a.handle,
        mark: <AgentAvatar agentId={a.id} size="sm" name={a.name} />,
        onSelect: () => void navigate({ to: "/org/$orgId/dm/agent/$agentId", params: { orgId, agentId: a.id } }),
      });
    }
    for (const m of dir.members) {
      if (m.userId === me.user.id) continue;
      list.push({
        key: `p:${m.userId}`,
        group: goTo,
        label: m.name,
        sub: t("palette.person"),
        keywords: `${m.handle} ${m.email}`,
        mark: <Avatar size="sm" name={m.name} imageUrl={m.image} />,
        onSelect: () => void navigate({ to: "/org/$orgId/dm/person/$userId", params: { orgId, userId: m.userId } }),
      });
    }
    const pages = [
      { key: "home", to: "/org/$orgId/home", icon: "home", label: t("shell.home") },
      { key: "dashboards", to: "/org/$orgId/dashboards", icon: "chart", label: t("dashboards.title") },
      { key: "waiting", to: "/org/$orgId/waiting", icon: "question", label: t("shell.waiting") },
      { key: "approvals", to: "/org/$orgId/approvals", icon: "waiting", label: t("shell.approvals") },
      { key: "proposals", to: "/org/$orgId/proposals", icon: "bulb", label: t("shell.proposals") },
      { key: "issues", to: "/org/$orgId/issues", icon: "issues", label: t("shell.issues") },
      { key: "routines", to: "/org/$orgId/routines", icon: "routines", label: t("shell.routines") },
      { key: "task-manager", to: "/org/$orgId/task-manager", icon: "stageProgress", label: t("taskManager.title") },
      { key: "calendar", to: "/org/$orgId/calendar", icon: "calendar", label: t("shell.calendar") },
      { key: "drive", to: "/org/$orgId/drive", icon: "drive", label: t("shell.drive") },
      { key: "team", to: "/org/$orgId/team", icon: "agent", label: t("shell.team") },
      { key: "members", to: "/org/$orgId/members", icon: "members", label: t("shell.members") },
      { key: "search", to: "/org/$orgId/search", icon: "search", label: t("shell.searchWorkspace") },
    ] as const;
    for (const p of pages) {
      list.push({
        key: `g:${p.key}`,
        group: goTo,
        label: p.label,
        sub: t("palette.page"),
        mark: <Icon name={p.icon} size={16} />,
        // Every page here takes only the org id.
        onSelect: () => void navigate({ to: p.to as "/org/$orgId/issues", params: { orgId } }),
      });
    }
    for (const p of wiki.data ?? []) {
      list.push({
        key: `w:${p.slug}`,
        group: goTo,
        label: p.title,
        sub: p.folder ? `${t("palette.wikiPage")} · ${p.folder}` : t("palette.wikiPage"),
        keywords: p.tags.join(" "),
        mark: <Icon name="book" size={16} />,
        onSelect: () => void navigate({ to: "/org/$orgId/wiki/$slug", params: { orgId, slug: p.slug } }),
      });
    }
    if (can(org, "edit_wiki"))
      list.push({
        key: "w:new",
        group: goTo,
        label: t("palette.wikiNew"),
        sub: t("shell.wiki"),
        keywords: t("palette.newWikiKeywords"),
        mark: <Icon name="plus" size={16} />,
        onSelect: () => void navigate({ to: "/org/$orgId/wiki", params: { orgId }, search: { new: "" } }),
      });
    // Each agent's own options, only for a typed query ("ada model", "instructions").
    const agentsGroup = t("palette.agents");
    const manages = can(org, "manage_agents");
    // A personal workspace's bar has fewer tabs (ADR 0159); "advanced" is where its sections land, not a place to name.
    const tabs = AGENT_TABS.filter(
      (tab) => tab !== "advanced" && (!isPersonal(org) || (PERSONAL_AGENT_TABS as readonly string[]).includes(tab)),
    );
    for (const a of dir.agents) {
      if (!listsAgent(org, a)) continue;
      const mark = <AgentAvatar agentId={a.id} size="sm" name={a.name} />;
      const keywords = [a.handle, t("palette.agentKeywords")].join(" ");
      const params = { orgId, agentId: a.id };
      // Who manages agents changes everything; its owner who thinks, its look, audience and computer (the server's rules).
      const edits = manages || a.ownerUserId === me.user.id;
      if (edits)
        list.push({
          key: `am:${a.id}`,
          group: agentsGroup,
          label: t("palette.agentOption", { name: a.name, what: t("palette.changeModel") }),
          keywords: [keywords, t("palette.changeModelKeywords")].join(" "),
          mark,
          searchOnly: true,
          // "Quem pensa" opens from the address (`?sec=brain`).
          onSelect: () => void navigate({ to: "/org/$orgId/agents/$agentId", params, search: { sec: "brain" } }),
        });
      for (const tab of tabs)
        list.push({
          key: `at:${a.id}:${tab}`,
          group: agentsGroup,
          label: t("palette.agentOption", {
            name: a.name,
            what: tab === "overview" ? t("palette.agentPage") : t(`agentPage.tabs.${tab}`),
          }),
          keywords,
          mark,
          searchOnly: true,
          onSelect: () =>
            void navigate({
              to: "/org/$orgId/agents/$agentId",
              params,
              search: { tab: tab === "overview" ? undefined : tab },
            }),
        });
      if (!edits) continue;
      for (const sec of AGENT_SECTIONS) {
        // "Quem pensa" is the model item above; archiving is for who manages agents.
        if (sec === "brain" || (sec === "danger" && !manages)) continue;
        list.push({
          key: `as:${a.id}:${sec}`,
          group: agentsGroup,
          label: t("palette.agentOption", { name: a.name, what: t(`agentPage.settings.${sec}`) }),
          keywords,
          mark,
          searchOnly: true,
          onSelect: () =>
            void navigate({ to: "/org/$orgId/agents/$agentId", params, search: { tab: "settings", sec } }),
        });
      }
    }
    const settingsGroup = t("palette.settingsGroup");
    for (const s of SETTINGS_SECTIONS) {
      if (!s.allowed(org, server)) continue;
      // Every section, by the name its settings list shows (a personal workspace's About you, ADR 0159), found by its
      // usual name too, and by what it holds ("time zone", "key").
      const label = t(settingsSectionNameKey(org, s.id));
      const usual = t(`settings.section.${s.id}`);
      list.push({
        key: `s:${s.id}`,
        group: settingsGroup,
        label,
        keywords: [
          s.id,
          label === usual ? "" : usual,
          t("palette.settingsKeywords"),
          t(`settings.sectionText.${s.id}`, { defaultValue: "" }),
          s.id === "usage" ? t("palette.keysKeywords") : "",
          s.id === "account" ? t("palette.accountKeywords") : "",
        ].join(" "),
        mark: s.id === "account" ? <MyFace size="xs" /> : <Icon name={s.icon} size={16} />,
        onSelect: () => void navigate({ to: "/org/$orgId/settings/$section", params: { orgId, section: s.id } }),
      });
    }
    // The theme, changed right here (the one not in use now).
    const themes: [ThemePreference, string][] = [
      ["system", t("shell.themeSystem")],
      ["light", t("shell.themeLight")],
      ["dark", t("shell.themeDark")],
    ];
    for (const [value, name] of themes) {
      if (value === theme.preference) continue;
      list.push({
        key: `th:${value}`,
        group: settingsGroup,
        label: t("palette.themeOption", { theme: name }),
        keywords: [t("palette.themeKeywords"), t("palette.settingsKeywords")].join(" "),
        mark: <Icon name="bulb" size={16} />,
        onSelect: () => theme.setPreference(value),
      });
    }
    // Things to make: a channel, an agent.
    if (can(org, "create_channels"))
      list.push({
        key: "do:channel",
        group: t("palette.actions"),
        label: t("palette.newChannel"),
        keywords: [t(modeKey(org, "palette.channel")), t("palette.createKeywords")].join(" "),
        mark: <Icon name="plus" size={16} />,
        onSelect: () => setCreatingChannel(true),
      });
    if (makesAgents(org))
      list.push({
        key: "do:agent",
        group: t("palette.actions"),
        label: t("shell.createAgent"),
        keywords: [t("palette.agent"), t("palette.createKeywords")].join(" "),
        mark: <Icon name="plus" size={16} />,
        // One dialog for every way in (ADR 0164); outside the shell, the full form.
        onSelect: () =>
          newAgent ? newAgent.open() : void navigate({ to: "/org/$orgId/agents/new", params: { orgId } }),
      });
    // Things to do, not places: the workspace's invite dialog (ADR 0090).
    if (invite && can(org, "invite_people"))
      list.push({
        key: "do:invite",
        group: t("palette.actions"),
        label: t("shell.invite"),
        sub: t("palette.inviteSub"),
        keywords: t("palette.inviteKeywords"),
        mark: <Icon name="plus" size={16} />,
        onSelect: () => invite.open(),
      });
    // Cargos' "Criar cargo" (ADR 0085), for who manages them.
    if (can(org, "manage_roles"))
      list.push({
        key: "do:role",
        group: t("palette.actions"),
        label: t("rolesPage.create"),
        sub: t("settings.section.roles"),
        keywords: t("palette.roleKeywords"),
        mark: <Icon name="plus" size={16} />,
        onSelect: () =>
          void navigate({
            to: "/org/$orgId/settings/$section",
            params: { orgId, section: "roles" },
            search: { create: 1 },
          }),
      });
    return list;
  }, [
    channels.data,
    wiki.data,
    dir.agents,
    dir.members,
    me.user.id,
    org,
    server,
    navigate,
    t,
    goTo,
    invite,
    newAgent,
    theme,
  ]);

  // "Pedir a um agente": the agents I can talk to, with what was typed.
  const askable = useMemo(() => dir.agents.filter((a) => canTalk(a)), [dir.agents]);
  const extra = useCallback(
    (q: string): PaletteItem[] => {
      const text = q.trim();
      if (!text) return [];
      // "theo, resume a semana" → just Theo; otherwise the first three.
      const named = askable.filter((a) => text.toLowerCase().startsWith(a.name.toLowerCase()));
      const targets = (named.length > 0 ? named : askable).slice(0, 3);
      return targets.map((a) => {
        const body = named.length > 0 ? text.slice(a.name.length).replace(/^[\s,:]+/, "") : text;
        return {
          key: `ask:${a.id}`,
          group: t("palette.ask"),
          label: t("palette.askLabel", { name: a.name, text: body || text }),
          sub: t("palette.newConversation"),
          mark: <AgentAvatar agentId={a.id} size="sm" name={a.name} />,
          onSelect: () => {
            setDraftFor(`agent:${a.id}`, body || text);
            void navigate({ to: "/org/$orgId/dm/agent/$agentId", params: { orgId: org.id, agentId: a.id } });
          },
        };
      });
    },
    [askable, navigate, org.id, t],
  );

  return (
    <>
      <NewChannelDialog open={creatingChannel} onOpenChange={setCreatingChannel} />
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        items={items}
        extra={extra}
        label={t("palette.open")}
        placeholder={t("palette.placeholder")}
        listLabel={t("palette.results")}
        emptyText={(q) => t("palette.empty", { q })}
      />
    </>
  );
}
