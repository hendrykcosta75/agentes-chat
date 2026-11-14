import type { Agent, Channel, InviteLink, InviteLinkTtl, OrgRole } from "../api/types";
import { answersOthers, audienceOf, modeOf } from "./audience";
import { engineOfBrain } from "./brain";
import { grants } from "./roles";

/** What an invitation starts someone with besides #general and the right hand (ADR 0184), as its chips show it. */
export interface InviteStart {
  channelIds: string[];
  agentIds: string[];
}

/**
 * What the invite dialog sends: the picked cargos' own channels and agents (their reach on the roles read), then the
 * ones added by hand, less the ones taken out. Picking another cargo brings its own in; the ones taken out stay out.
 */
export function inviteStart(
  roles: readonly Pick<OrgRole, "id" | "channelIds" | "agentIds">[],
  picked: readonly string[],
  added: InviteStart,
  removed: InviteStart,
): InviteStart {
  const mine = roles.filter((r) => picked.includes(r.id));
  const pick = (own: string[], extra: string[], gone: string[]) =>
    [...new Set([...own, ...extra])].filter((id) => !gone.includes(id));
  return {
    channelIds: pick(
      mine.flatMap((r) => r.channelIds ?? []),
      added.channelIds,
      removed.channelIds,
    ),
    agentIds: pick(
      mine.flatMap((r) => r.agentIds ?? []),
      added.agentIds,
      removed.agentIds,
    ),
  };
}

/**
 * How an agent may go with an invitation, the server's rule (`agentOk`, packages/engine/src/invite-choices.ts):
 * `everyone` (it talks to everyone), `cargo` (limited to a picked cargo), `opens` (restricted, and the viewer lets the
 * person in), or not: `locked` (restricted, someone else's to open), `plan` (it keeps its plan for its owner) or
 * `mailbox` (it reads someone else's mailbox, which opening it would take).
 */
export type InviteAgentCase = "everyone" | "cargo" | "opens" | "locked" | "plan" | "mailbox";

export function inviteAgentCase(
  agent: Agent,
  viewer: { userId: string; managesAgents: boolean },
  /** The picked cargos' agents (`inviteStart`'s, before the ones taken out). */
  cargoAgentIds: readonly string[],
  /** Whose mailboxes opening it would take (`agents.audienceMailLoss`), for one the viewer may open. */
  mailboxOwners: readonly string[] = [],
): InviteAgentCase {
  if (modeOf(agent) === "everyone") return "everyone";
  if (cargoAgentIds.includes(agent.id)) return "cargo";
  if (!viewer.managesAgents && agent.ownerUserId !== viewer.userId) return "locked";
  const onPlan = engineOfBrain(agent.brain?.kind) !== "agent";
  if (onPlan && !answersOthers({ ...audienceOf(agent), consultable: false }, agent.ownerUserId)) return "plan";
  return mailboxOwners.length > 0 ? "mailbox" : "opens";
}

/** The cases an invitation may pick. */
export const invitePickable = (c: InviteAgentCase) => c === "everyone" || c === "cargo" || c === "opens";

/** What the picked cargos give with Todos: whether the person may talk to agents, and whether one is Administrador. */
export function inviteReach(roles: readonly Pick<OrgRole, "id" | "kind" | "permissions">[], picked: readonly string[]) {
  const held = roles.filter((r) => r.kind === "everyone" || picked.includes(r.id));
  const keys = grants(held.flatMap((r) => r.permissions));
  return {
    talks: keys.has("talk_to_agents"),
    admin: roles.some((r) => picked.includes(r.id) && r.permissions.includes("administrator")),
  };
}

/**
 * The channels an invitation may start someone in besides #general, the server's rule (`channelVerdicts`,
 * packages/engine/src/invite-choices.ts): a public one, one the viewer is in, or a private one limited to a picked
 * cargo. One an administrator only sees (ADR 0151) is none of these.
 */
export function invitableChannels<
  C extends Pick<Channel, "id" | "name" | "visibility" | "isMember" | "audienceRoleIds">,
>(channels: readonly C[], picked: readonly string[]): C[] {
  return channels.filter(
    (c) =>
      c.name !== "general" &&
      (c.visibility === "public" || c.isMember || (c.audienceRoleIds ?? []).some((r) => picked.includes(r))),
  );
}

/** How long a link works (ADR 0184), shortest first: the dialog's Validade, 30 days to start. */
export const INVITE_LINK_TTLS: readonly InviteLinkTtl[] = ["30m", "1h", "1d", "7d", "30d", "never"];
export const INVITE_LINK_TTL = "30d" satisfies InviteLinkTtl;
/** How many people a link takes (ADR 0184): the dialog's Máximo de pessoas; null, no limit (to start). */
export const INVITE_LINK_MAX_USES: readonly (number | null)[] = [1, 5, 10, 25, 50, 100, null];

/** A link's choices in the dialog. */
export interface LinkChoices {
  roleIds: string[];
  channelIds: string[];
  agentIds: string[];
  expiresIn: InviteLinkTtl;
  maxUses: number | null;
}

/**
 * Whether a link's choices are the workspace's own link (no cargo, no channel or agent besides #general and the right
 * hand, 30 days, no limit): the server answers those with that link, renewed (`createInviteLink`'s `atDefaults`).
 */
export const plainLink = (c: LinkChoices) =>
  c.roleIds.length === 0 &&
  c.channelIds.length === 0 &&
  c.agentIds.length === 0 &&
  c.maxUses === null &&
  c.expiresIn === INVITE_LINK_TTL;

/** Two links' choices alike: the one made still is what the fields say. */
export const sameChoices = (a: LinkChoices, b: LinkChoices) => {
  const same = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && [...x].sort().join() === [...y].sort().join();
  return (
    same(a.roleIds, b.roleIds) &&
    same(a.channelIds, b.channelIds) &&
    same(a.agentIds, b.agentIds) &&
    a.expiresIn === b.expiresIn &&
    a.maxUses === b.maxUses
  );
};

/** Whether a link took all its people: approving through it is refused until its maximum grows. */
export const linkFull = (link: Pick<InviteLink, "maxUses" | "uses">) =>
  link.maxUses !== null && link.maxUses !== undefined && (link.uses ?? 0) >= link.maxUses;
