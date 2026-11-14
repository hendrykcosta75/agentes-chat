import type { Agent, Channel, OrgRole } from "@agenteschat/client";
import { channelMembersQuery, useApi, useChannelCategories, useChannels, useRoles } from "@agenteschat/client";
import { sameList } from "@agenteschat/client/lib/agent-edit";
import { EVERYONE_AUDIENCE, listsAgent } from "@agenteschat/client/lib/audience";
import { joinNames } from "@agenteschat/client/lib/format";
import { agentGrammar } from "@agenteschat/client/lib/grammar";
import {
  type InviteAgentCase,
  type InviteStart,
  invitableChannels,
  inviteAgentCase,
  invitePickable,
  inviteReach,
  inviteStart,
} from "@agenteschat/client/lib/invite-start";
import { can } from "@agenteschat/client/lib/permissions";
import { personalHelperRole } from "@agenteschat/client/lib/personal-view";
import { isRightHand } from "@agenteschat/client/lib/right-hand";
import { everyoneOf, isEveryone, sortRoles } from "@agenteschat/client/lib/roles";
import { isPersonal } from "@agenteschat/client/lib/workspace-mode";
import {
  ChipField,
  type ChipFieldOption,
  type ChipFieldToken,
  Field,
  Icon,
  type IconName,
  Menu,
  MenuHeading,
  RoleMark,
  Select,
} from "@agenteschat/ui";
import { useQueries } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useOrg } from "@/components/org-context";
import { RoleChoices } from "@/components/roles/RolesPicker";
import { useDirectory } from "@/hooks/useDirectory";
import { lookOf } from "@/lib/look";

/*
 * What an invitation or a link gives (ADR 0184), as the invite dialog, Editar link and Editar convite ask it: Cargo,
 * Canais and Agentes, each a kit Field with its label and ⓘ on top and the control at the field's width.
 */

const NONE: InviteStart = { channelIds: [], agentIds: [] };

/** The role picker's value for no cargo in a personal workspace: a member, who uses the agents. */
export const MEMBER = "member";

/** What the fields start on: the cargos, and the channels and agents besides #general and the right hand. */
export interface ChoicesStart {
  roleIds: string[];
  channelIds: string[];
  agentIds: string[];
}

/**
 * The fields' state. A picked cargo brings its own channels and agents (`inviteStart`); what the person takes out
 * stays out, and what they add stays in, whatever cargo comes or goes. `exact`: the lists are what an existing link or
 * invitation gives, so a cargo's own channel it left out starts out.
 */
export function useInviteChoices(start: ChoicesStart, { exact = false }: { exact?: boolean } = {}) {
  const { org } = useOrg();
  const roles = useRoles(org.id).data?.roles ?? [];
  const [roleIds, setRoleIds] = useState(start.roleIds);
  const [added, setAdded] = useState<InviteStart>({ channelIds: start.channelIds, agentIds: start.agentIds });
  const [taken, setTaken] = useState<InviteStart | null>(exact ? null : NONE);
  // While the roles load, the cargos stay as given; then only ones still there count.
  const picked = roles.length ? roleIds.filter((id) => roles.some((r) => r.id === id && !isEveryone(r))) : roleIds;
  const own = inviteStart(roles, picked, NONE, NONE);
  const first = inviteStart(roles, start.roleIds, NONE, NONE);
  const removed = taken ?? {
    channelIds: first.channelIds.filter((id) => !start.channelIds.includes(id)),
    agentIds: first.agentIds.filter((id) => !start.agentIds.includes(id)),
  };
  const set = (kind: keyof InviteStart, id: string, on: boolean) => {
    const without = (list: string[]) => list.filter((x) => x !== id);
    setAdded((a) => ({ ...a, [kind]: on ? [...without(a[kind]), id] : without(a[kind]) }));
    setTaken({ ...removed, [kind]: on ? without(removed[kind]) : [...without(removed[kind]), id] });
  };
  return {
    roles,
    roleIds: picked,
    setRoleIds: (ids: string[]) => {
      setTaken(removed);
      setRoleIds(ids);
    },
    start: inviteStart(roles, picked, added, removed),
    /** The picked cargos' own channels and agents. */
    own,
    /** The first picked cargo that brings a channel or an agent, for its token's tip and its row. */
    roleOf: (id: string) =>
      sortRoles(
        roles.filter((r) => picked.includes(r.id) && [...(r.channelIds ?? []), ...(r.agentIds ?? [])].includes(id)),
      )[0],
    set,
  };
}

export type InviteChoices = ReturnType<typeof useInviteChoices>;

/** A line under a field: a muted note, or what to fix in the danger tone. */
export function FieldLine({
  id,
  tone,
  icon,
  children,
}: {
  id?: string;
  tone?: "danger";
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      className={`${tone === "danger" ? "ac-field__error" : "ac-field__example"} invite-line ac-iconline`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <Icon name={icon ?? (tone === "danger" ? "alert" : "info")} size={14} />
      <span>{children}</span>
    </p>
  );
}

/**
 * Cargo: each picked cargo's mark and name, or Todos' and "Membro" with none; a menu that stays open while ticking,
 * of the cargos the person may give, and a picked one they can't, to take out. A personal workspace says it in its
 * plain words (ADR 0159): "Pode", one choice.
 */
export function RoleField({ choices, id }: { choices: InviteChoices; id: string }) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const roles = choices.roles;
  if (isPersonal(org)) {
    const helper = personalHelperRole(roles);
    const label = t("invites.rolePersonal");
    const options = [
      { value: MEMBER, label: t("members.dialog.role.uses"), hint: t("members.dialog.role.usesText") },
      ...(helper
        ? [{ value: helper.id, label: t("members.dialog.role.helps"), hint: t("members.dialog.role.helpsText") }]
        : []),
      ...sortRoles(roles.filter((r) => !isEveryone(r) && r.givable && r.id !== helper?.id)).map((r) => ({
        value: r.id,
        label: r.name,
      })),
    ];
    const value = choices.roleIds.find((r) => options.some((o) => o.value === r)) ?? MEMBER;
    return (
      <Field label={label} id={id}>
        <Select value={value} options={options} onValueChange={(v) => choices.setRoleIds(v === MEMBER ? [] : [v])} />
      </Field>
    );
  }
  const label = t("invites.role");
  const everyone = everyoneOf(roles);
  const picked = sortRoles(roles.filter((r) => choices.roleIds.includes(r.id)));
  return (
    <Field label={label} id={id} hint={{ name: t("common.about", { label }), text: t("invites.roleHint") }}>
      <Menu
        label={label}
        align="start"
        className="invite-rolemenu"
        trigger={
          <button type="button" id={id} className="ac-select__trigger invite-role">
            <span className="ac-select__value invite-role__value">
              {picked.length ? (
                picked.map((r) => (
                  <span key={r.id} className="invite-role__item ac-iconline">
                    <RoleMark color={r.color} icon={r.icon} size={18} />
                    <span>{r.name}</span>
                  </span>
                ))
              ) : (
                <span className="invite-role__item ac-iconline">
                  {everyone && <RoleMark color={everyone.color} icon={everyone.icon} size={18} />}
                  <span>{t("roles.member")}</span>
                </span>
              )}
            </span>
            <svg className="ac-select__chev" viewBox="0 0 20 20" aria-hidden="true">
              <path d="m6 8 4 4 4-4" />
            </svg>
          </button>
        }
      >
        <MenuHeading>{t("rolesPage.rolesCta")}</MenuHeading>
        <RoleChoices roles={roles} value={choices.roleIds} onChange={choices.setRoleIds} invite />
      </Menu>
    </Field>
  );
}

/** A channel refused when sending: its token turns invalid and its line says why (`invitation.channel`). */
export interface RefusedChannel {
  id: string;
  name: string | null;
  why: "archived" | "left" | "gone";
}

/**
 * Canais: #general first, fixed; then the cargo's channels and the ones added. The list floats under the field: the
 * cargo's channels, then the sidebar's categories, each row with how many people are there and the agents by name.
 */
export function ChannelsField({
  choices,
  id,
  fromChannelId,
  refused,
}: {
  choices: InviteChoices;
  id: string;
  /** Inviting from a channel's "Adicionar pessoa ou agente": that channel says so. */
  fromChannelId?: string;
  refused?: RefusedChannel | null;
}) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const api = useApi();
  const dir = useDirectory(org.id);
  const channels = useChannels(org.id).data ?? [];
  const categories = useChannelCategories(org.id).data ?? [];
  const [listed, setListed] = useState(false);
  const personal = isPersonal(org);
  const general = channels.find((c) => c.name === "general");
  const offered = invitableChannels(channels, choices.roleIds);
  // Who is in each channel, read once the list first opens.
  const rosters = useQueries({
    queries: offered.map((c) => ({ ...channelMembersQuery(api, org.id, c.id), enabled: listed })),
  });
  const byId = new Map<string, Channel>(offered.map((c) => [c.id, c]));
  const fromRole = new Set(choices.own.channelIds);
  const icon = (c: Channel) => (c.visibility === "private" ? "lock" : "channel");
  const tokens: ChipFieldToken[] = [
    ...(general
      ? [
          {
            key: general.id,
            label: general.name,
            leading: <Icon name="channel" size={14} />,
            fixed: true,
            tip: t("invites.general", { channel: general.name }),
          },
        ]
      : []),
    ...choices.start.channelIds.flatMap((cid) => {
      const c = byId.get(cid) ?? (refused?.id === cid ? channels.find((x) => x.id === cid) : undefined);
      if (!c && refused?.id !== cid) return [];
      const name = c?.name ?? refused?.name ?? "?";
      const role = choices.roleOf(cid);
      const tip = role
        ? t("invites.fromRole", { role: role.name })
        : cid === fromChannelId
          ? t("invites.fromChannel")
          : undefined;
      return [
        {
          key: cid,
          label: name,
          leading: <Icon name={c ? icon(c) : "channel"} size={14} />,
          removeLabel: t("common.removeName", { name: `#${name}` }),
          tip,
          fresh: fromRole.has(cid),
          state: refused?.id === cid ? ("invalid" as const) : undefined,
        },
      ];
    }),
  ];
  const known = new Set(categories.map((g) => g.id));
  const order = (list: Channel[]) =>
    [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
  const cargoNames = sortRoles(choices.roles.filter((r) => choices.roleIds.includes(r.id))).map((r) => r.name);
  const groups = [
    {
      name: t("invites.groupRole", { count: cargoNames.length, roles: joinNames(cargoNames, t) }),
      list: order(offered.filter((c) => fromRole.has(c.id))),
    },
    {
      name: personal ? t("invites.channelsPersonal") : t("shell.channels"),
      list: order(offered.filter((c) => !fromRole.has(c.id) && (!c.categoryId || !known.has(c.categoryId)))),
    },
    ...[...categories]
      .sort((a, b) => a.position - b.position)
      .map((g) => ({ name: g.name, list: order(offered.filter((c) => !fromRole.has(c.id) && c.categoryId === g.id)) })),
  ].filter((g) => g.list.length > 0);
  const said = (c: Channel) => {
    if (c.visibility === "private" && c.isMember) return t("members.dialog.where.private");
    const roster = rosters[offered.indexOf(c)]?.data;
    if (!roster) return " ";
    const agents = roster.filter((m) => m.type === "agent").flatMap((m) => dir.agentById.get(m.id) ?? []);
    const people = roster.filter((m) => m.type === "person").length;
    return [
      t("members.dialog.where.people", { count: people }),
      agents.length
        ? joinNames(
            agents.slice(0, 2).map((a) => a.name),
            t,
          )
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const rows: ChipFieldOption[] = groups.flatMap((g) =>
    g.list.map((c) => ({
      value: c.id,
      label: `#${c.name}`,
      leading: <Icon name={icon(c)} size={16} />,
      description: said(c),
      group: g.name,
      picked: choices.start.channelIds.includes(c.id),
    })),
  );
  const label = personal ? t("invites.channelsPersonal") : t("invites.channels");
  const lineId = `${id}-line`;
  return (
    <Field
      label={label}
      id={id}
      hint={{
        name: t("common.about", { label }),
        text: t(personal ? "invites.channelsHintPersonal" : "invites.channelsHint"),
      }}
    >
      <ChipField
        tokens={tokens}
        onRemove={(cid) => choices.set("channelIds", cid, false)}
        placeholder={t(personal ? "invites.addChannelPersonal" : "invites.addChannel")}
        options={rows}
        onPick={(o) => choices.set("channelIds", o.value, !o.picked)}
        onOpenChange={(open) => {
          if (open) setListed(true);
        }}
        listLabel={label}
        empty={(query) => (query ? t("invites.noChannel", { query }) : t("invites.noChannels"))}
        aria-describedby={refused ? lineId : undefined}
      />
      {refused && (
        <FieldLine id={lineId} tone="danger">
          {refused.why === "gone"
            ? t("invites.refused.channelGone")
            : t(refused.why === "archived" ? "invites.refused.channelArchived" : "invites.refused.channelLeft", {
                channel: refused.name ?? "",
              })}
        </FieldLine>
      )}
    </Field>
  );
}

/** An agent refused when sending (`invitation.agent`): it left the team, or the viewer may no longer open it. */
export interface RefusedAgent {
  id: string;
  name: string | null;
  why: "gone" | "locked";
}

/** The order the list shows agents in: the ones that go first, then why the others don't. */
const CASE_ORDER: Record<InviteAgentCase, number> = { cargo: 0, everyone: 1, opens: 2, locked: 3, mailbox: 4, plan: 5 };

/**
 * Agentes: the right hand first, fixed (everyone has it); then the cargo's agents and the ones added: who the person
 * starts with (pinned on top of their list, named in the e-mail). The list says for each agent whether it can go and,
 * when not, why; a row that reads someone's mailbox, or that keeps its owner's plan and is the viewer's, opens its page
 * (`onGo`), where that is decided.
 */
export function AgentsField({
  choices,
  id,
  live,
  refused,
  onGo,
}: {
  choices: InviteChoices;
  id: string;
  /** While the dialog is open: whose mailboxes each agent the viewer may open reads, asked once. */
  live: boolean;
  refused?: RefusedAgent | null;
  onGo: (agent: Agent) => void;
}) {
  const { t } = useTranslation();
  const { org, me } = useOrg();
  const api = useApi();
  const dir = useDirectory(org.id);
  const viewer = { userId: me.user.id, managesAgents: can(org, "manage_agents") };
  const right = dir.agents.find(isRightHand);
  const listed = dir.agents.filter((a) => !isRightHand(a) && listsAgent(org, a));
  const cargoAgents = choices.own.agentIds;
  // A restricted agent the viewer may open goes only when that takes nobody's mailbox: asked of the server.
  const candidates = listed.filter((a) => inviteAgentCase(a, viewer, cargoAgents) === "opens");
  const mail = useQueries({
    queries: candidates.map((a) => ({
      queryKey: ["invite-mail-loss", org.id, a.id],
      queryFn: () => api.agents.mailLoss(org.id, a.id, EVERYONE_AUDIENCE),
      enabled: live,
      staleTime: 30_000,
    })),
  });
  const owners = new Map(
    candidates.map((a, i) => [a.id, (mail[i]?.data ?? []).map((m) => m.ownerName ?? t("channel.unknownPerson"))]),
  );
  const caseOf = (a: Agent) => inviteAgentCase(a, viewer, cargoAgents, owners.get(a.id) ?? []);
  const reach = inviteReach(choices.roles, choices.roleIds);
  const ownerName = (a: Agent) => (a.ownerUserId ? dir.memberById.get(a.ownerUserId)?.name : undefined);
  const fromRole = new Set(cargoAgents);
  const byId = new Map(listed.map((a) => [a.id, a]));
  const shown = choices.start.agentIds.filter((aid) => byId.has(aid) || refused?.id === aid);
  const tokens: ChipFieldToken[] = [
    ...(right
      ? [
          {
            key: right.id,
            label: right.name,
            leading: <AgentAvatar name={right.name} appearance={lookOf(right)} size="xs" />,
            fixed: true,
            tip: t("invites.rightHand", agentGrammar(right.name)),
          },
        ]
      : []),
    ...shown.map((aid) => {
      const a = byId.get(aid);
      const name = a?.name ?? refused?.name ?? "?";
      const role = choices.roleOf(aid);
      return {
        key: aid,
        label: name,
        leading: a ? <AgentAvatar name={a.name} appearance={lookOf(a)} size="xs" /> : undefined,
        removeLabel: t("common.removeName", { name }),
        tip: role ? t("invites.fromRole", { role: role.name }) : undefined,
        fresh: fromRole.has(aid),
        state: refused?.id === aid ? ("invalid" as const) : undefined,
      };
    }),
  ];
  const describe = (a: Agent, c: InviteAgentCase): string => {
    const owner = ownerName(a);
    switch (c) {
      case "everyone":
        return a.role ?? "";
      case "cargo":
        return t("invites.agent.byRole", { role: choices.roleOf(a.id)?.name ?? "" });
      case "opens":
        return t("invites.agent.opens");
      case "locked":
        return owner ? t("invites.agent.locked", { name: owner }) : t("invites.agent.lockedNoOwner");
      case "mailbox":
        return t("invites.agent.mailbox", { names: joinNames([...new Set(owners.get(a.id) ?? [])], t) });
      case "plan":
        return a.ownerUserId === me.user.id
          ? t("invites.agent.planMine")
          : t("invites.agent.plan", { name: owner ?? "" });
    }
  };
  const cargoNames = sortRoles(choices.roles.filter((r) => choices.roleIds.includes(r.id))).map((r) => r.name);
  const agentsGroup = t("invites.agents");
  const sorted = [...listed].sort(
    (a, b) => CASE_ORDER[caseOf(a)] - CASE_ORDER[caseOf(b)] || a.name.localeCompare(b.name),
  );
  const rows: ChipFieldOption[] = [
    ...sorted
      .filter((a) => caseOf(a) === "cargo")
      .map((a) => row(a, t("invites.groupRole", { count: cargoNames.length, roles: joinNames(cargoNames, t) }))),
    ...(right
      ? [
          {
            value: right.id,
            label: right.name,
            leading: <AgentAvatar name={right.name} appearance={lookOf(right)} size="sm" />,
            description: t("invites.agent.rightHand", agentGrammar(right.name)),
            group: agentsGroup,
            disabled: true,
            picked: true,
          },
        ]
      : []),
    ...sorted.filter((a) => caseOf(a) !== "cargo").map((a) => row(a, agentsGroup)),
  ];
  function row(a: Agent, group: string): ChipFieldOption {
    const c = caseOf(a);
    const mine = a.ownerUserId === me.user.id;
    const goes = c === "mailbox" || (c === "plan" && mine);
    const description = describe(a, c);
    return {
      value: a.id,
      label: a.name,
      leading: <AgentAvatar name={a.name} appearance={lookOf(a)} size="sm" />,
      description: c === "mailbox" ? <span title={t("invites.agent.mailboxHint")}>{description}</span> : description,
      words: description,
      group,
      disabled: !invitePickable(c) && !goes,
      goes,
      picked: choices.start.agentIds.includes(a.id),
    };
  }
  // The restricted ones picked start answering whoever joins: said, by name.
  const opening = shown.flatMap((aid) => {
    const a = byId.get(aid);
    return a && caseOf(a) === "opens" ? [a.name] : [];
  });
  const label = t("invites.agents");
  const lineId = `${id}-line`;
  const admin = sortRoles(
    choices.roles.filter((r) => choices.roleIds.includes(r.id) && r.permissions.includes("administrator")),
  )[0];
  const notes = [
    admin ? t("invites.admin", { role: admin.name }) : null,
    opening.length ? t("invites.opens", { count: opening.length, names: joinNames(opening, t) }) : null,
  ].filter((n): n is string => n !== null);
  return (
    <Field label={label} id={id} hint={{ name: t("common.about", { label }), text: t("invites.agentsHint") }}>
      <ChipField
        tokens={reach.talks ? tokens : tokens.slice(0, right ? 1 : 0)}
        onRemove={(aid) => choices.set("agentIds", aid, false)}
        placeholder={t("invites.addAgent")}
        options={rows}
        onPick={(o) => {
          const a = byId.get(o.value);
          if (o.goes && a) onGo(a);
          else choices.set("agentIds", o.value, !o.picked);
        }}
        listLabel={label}
        empty={(query) => (query ? t("invites.noAgent", { query }) : t("invites.noAgents"))}
        disabled={!reach.talks}
        aria-describedby={refused || !reach.talks || notes.length ? lineId : undefined}
      />
      {refused ? (
        <FieldLine id={lineId} tone="danger">
          {t(
            refused.why === "gone" ? "invites.refused.agentGone" : "invites.refused.agentLocked",
            agentGrammar(refused.name ?? "", refused.name ?? ""),
          )}
        </FieldLine>
      ) : !reach.talks ? (
        <FieldLine id={lineId}>{t("invites.noTalk")}</FieldLine>
      ) : (
        notes.length > 0 && (
          <FieldLine id={lineId}>
            {notes.length > 1 ? t("common.joinSentences", { a: notes[0], b: notes[1] }) : notes[0]}
          </FieldLine>
        )
      )}
    </Field>
  );
}

/** The agents an invitation sends: none when the person can't talk to agents. */
export const agentsToSend = (choices: InviteChoices) =>
  inviteReach(choices.roles, choices.roleIds).talks ? choices.start.agentIds : [];

/** The cargos as the server takes them: a personal workspace's "member" is none. */
export const rolesToSend = (choices: InviteChoices) => choices.roleIds.filter((id) => id !== MEMBER);

/** The channels an invitation sends: the ones the viewer may still name, besides #general. */
export function channelsToSend(choices: InviteChoices, channels: readonly Channel[]) {
  const offered = new Set(invitableChannels(channels, choices.roleIds).map((c) => c.id));
  return choices.start.channelIds.filter((cid) => offered.has(cid));
}

/**
 * What Editar sends of a link's or an invitation's choices: only the lists changed from `was`. The server checks every
 * id it gets for whoever edits, so one left as someone higher made it (a cargo above theirs, a channel they aren't in)
 * stays as it is instead of refusing the save or dropping out of it.
 */
export function changedChoices(choices: InviteChoices, channels: readonly Channel[], was: ChoicesStart) {
  const roleIds = rolesToSend(choices);
  return {
    ...(sameList(roleIds, was.roleIds) ? {} : { roleIds }),
    ...(sameList(choices.start.channelIds, was.channelIds) ? {} : { channelIds: channelsToSend(choices, channels) }),
    ...(sameList(choices.start.agentIds, was.agentIds) ? {} : { agentIds: agentsToSend(choices) }),
  };
}

/** A role's mark for a row or a link: the first cargo's, or Todos' for a member. */
export function MarkOf({ roles, ids, size }: { roles: readonly OrgRole[]; ids: readonly string[]; size: number }) {
  const first = sortRoles(roles.filter((r) => ids.includes(r.id)))[0] ?? everyoneOf(roles);
  return first ? <RoleMark color={first.color} icon={first.icon} size={size} /> : null;
}
