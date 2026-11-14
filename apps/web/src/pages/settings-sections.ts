import type { AuthConfig, OrgSummary } from "@agenteschat/client";
import { selfHosted, showsAbout } from "@agenteschat/client/lib/about";
import { can } from "@agenteschat/client/lib/permissions";
import { personalSettingsShort } from "@agenteschat/client/lib/personal-view";
import { settingsEntry, teamSettings } from "@agenteschat/client/lib/settings-nav";
import { isPersonal } from "@agenteschat/client/lib/workspace-mode";
import type { IconName } from "@agenteschat/ui";

// Apart from the settings page so the shell (⌘K, the sidebar) and the settings routes' guards can read
// the sections without loading the page itself.

export type SettingsSection =
  | "account"
  | "notifications"
  | "approvals"
  | "apps"
  | "general"
  | "members"
  | "invites"
  | "roles"
  | "vault"
  | "audit"
  | "access"
  | "connectors"
  | "skills"
  | "storage"
  | "devices"
  | "usage"
  | "billing"
  | "import"
  | "media"
  | "voice"
  | "about";

/**
 * Every settings section with who can open it on this server, in the order the list and each entry's tabs show them:
 * an entry, then the sections its page holds (`SETTINGS_PARTS`), then what goes under Advanced.
 */
export const SETTINGS_SECTIONS: {
  id: SettingsSection;
  icon: IconName;
  allowed: (org: OrgSummary, server: AuthConfig | undefined) => boolean;
}[] = [
  // Mine, not the workspace's: my profile here and what this device keeps (the nav shows my face for it).
  { id: "account", icon: "person", allowed: () => true },
  // What reaches my devices as a notification here (ADR 0071 §8).
  { id: "notifications", icon: "bell", allowed: () => true },
  // Who approves for me, and whom I approve for (ADR 0139).
  { id: "approvals", icon: "approve", allowed: () => true },
  // AI apps (ADR 0119): each person connects their own, in this workspace.
  { id: "apps", icon: "link", allowed: () => true },
  // The workspace's sections are for who runs it: a member keeps only their own (above) and what they use themselves
  // (the people, where a member who may not invite suggests someone (ADR 0090), connectors, computers, AI accounts).
  { id: "general", icon: "settings", allowed: (o) => can(o, "configure") },
  // GIFs and stickers in chat (ADR 0091): who configures the workspace.
  { id: "media", icon: "sticker", allowed: (o) => can(o, "configure") },
  // Voice messages (ADR 0100): who configures the workspace, on a self-hosted server only. agentes.chat Cloud runs its
  // own speech engine, so the section has nothing to offer there (product decision).
  { id: "voice", icon: "mic", allowed: (o, server) => selfHosted(server) && can(o, "configure") },
  { id: "members", icon: "members", allowed: () => true },
  // Convites (ADR 0184): People's second tab, for who may invite: the requests waiting, the links and the e-mails.
  { id: "invites", icon: "mail", allowed: (o) => can(o, "invite_people") },
  // Cargos (ADR 0085): an entry of its own, for who manages them.
  { id: "roles", icon: "shield", allowed: (o) => can(o, "manage_roles") },
  // "IA e uso", for everyone (ADR 0063): the workspace's AI accounts with their meters, what each person does with
  // their own, and the agents whose details they see, in tokens and percentages. The workspace's API keys only for who
  // manages them, money and the workspace's report only for who has `view_usage`.
  { id: "usage", icon: "wallet", allowed: () => true },
  // Only where a billing service runs (ADR 0079), for who may open it.
  { id: "billing", icon: "coin", allowed: (o, server) => !!server?.billingUrl && can(o, "manage_billing") },
  { id: "connectors", icon: "plug", allowed: () => true },
  { id: "skills", icon: "bulb", allowed: (o) => can(o, "manage_agents") },
  // Every member keeps their own logins, keys and contacts there; team items show to who they're shared with (ADR 0144).
  { id: "vault", icon: "lock", allowed: () => true },
  { id: "access", icon: "agent", allowed: (o) => can(o, "manage_agents") },
  // Every member sees the devices and can connect one (ADR 0025): computers and the phones they reach.
  { id: "devices", icon: "computer", allowed: (o) => can(o, "read") },
  { id: "storage", icon: "drive", allowed: (o) => can(o, "configure") },
  { id: "import", icon: "archiveBox", allowed: (o) => can(o, "create_agents") },
  // What agents did and people changed: only for who may see it (it shows everyone's work).
  { id: "audit", icon: "shield", allowed: (o) => can(o, "view_audit") },
  // AGPL-3.0's legal notices and the license's required attribution: for everyone on a self-hosted server, never
  // hidden there; none on agentes.chat Cloud (`showsAbout`).
  { id: "about", icon: "info", allowed: (_o, server) => showsAbout(server) },
];

export const isSettingsSection = (v: unknown): v is SettingsSection => SETTINGS_SECTIONS.some((s) => s.id === v);

/**
 * Sections that became another one's: Computers is Devices, AI accounts is part of AI and usage. Their addresses
 * still open, on the section that holds them now.
 */
export const MOVED_SETTINGS_SECTIONS: Readonly<Record<string, SettingsSection>> = {
  computers: "devices",
  keys: "usage",
};

/** Where the workspace's right hand is set now: its own page. Its old settings address opens that. */
export const RIGHT_HAND_SECTION = "right_hand";

/**
 * The short list of this workspace's settings: a personal one's own (ADR 0159 §3, People on it once `others` are
 * members), a team's entries.
 */
export const settingsShort = (
  org: Pick<OrgSummary, "mode">,
  server: AuthConfig | undefined,
  others?: number,
): readonly string[] => (isPersonal(org) ? personalSettingsShort(others) : teamSettings(server?.cloud === true));

/** The nav entry that stands for the open section: the one whose page holds it, else the section itself. */
export function settingsNavEntry(
  current: SettingsSection,
  open: readonly SettingsSection[],
  short: readonly string[],
): SettingsSection {
  const entry = settingsEntry(current, new Set(open), short);
  return isSettingsSection(entry) ? entry : current;
}

/**
 * `?connected=github` (back from OAuth), `?review=1` (a custom MCP server to
 * classify), `?mail=connected|failed&account={id}` (back from Gmail/Outlook),
 * `?request={id}&do=approve|deny` (a request to join, from the admins' email),
 * `?delete=1` (Geral's dialog that deletes the workspace), `?create=1` (Cargos' Criar cargo, from ⌘K), `?install={link}` (Skills, back from connecting GitHub
 * in Instalar skill: the link to read again, with `agent` when an agent's card opened it) and `?agent={id}`
 * (Auditoria filtered to that agent).
 */
export const settingsSearch = (
  search: Record<string, unknown>,
): {
  connected?: string;
  outcome?: string;
  review?: string;
  mail?: string;
  account?: string;
  request?: string;
  do?: "approve" | "deny";
  delete?: 1;
  install?: string;
  skill?: string;
  agent?: string;
  /** Uso › Pessoas: the person whose month opens (ADR 0141). */
  person?: string;
  /** Cargos, with Criar cargo open (⌘K). */
  create?: 1;
} => ({
  connected: typeof search.connected === "string" ? search.connected : undefined,
  outcome: typeof search.outcome === "string" ? search.outcome : undefined,
  review: search.review === undefined ? undefined : String(search.review),
  mail: typeof search.mail === "string" ? search.mail : undefined,
  account: typeof search.account === "string" ? search.account : undefined,
  request: typeof search.request === "string" ? search.request : undefined,
  do: search.do === "approve" || search.do === "deny" ? search.do : undefined,
  delete: search.delete === undefined ? undefined : 1,
  install: typeof search.install === "string" ? search.install : undefined,
  skill: typeof search.skill === "string" ? search.skill : undefined,
  agent: typeof search.agent === "string" ? search.agent : undefined,
  person: typeof search.person === "string" ? search.person : undefined,
  create: search.create === undefined ? undefined : 1,
});
