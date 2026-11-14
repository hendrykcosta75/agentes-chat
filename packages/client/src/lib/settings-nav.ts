/**
 * The settings list (web): a few entries, each a page whose tabs are the sections it holds, then Advanced with the
 * rest. Pure: which section is listed where, never who may open it. Ids are the settings sections'
 * (`/settings/{id}`), and every section keeps its own address, which opens its entry on that tab.
 */

/** The section whose page shows each of these as a tab (billing: as a part under AI and usage's own tabs). */
export const SETTINGS_PARTS: Readonly<Record<string, string>> = {
  invites: "members",
  notifications: "account",
  approvals: "account",
  apps: "account",
  media: "general",
  voice: "general",
  billing: "usage",
  skills: "connectors",
  vault: "connectors",
  access: "connectors",
};

/** A team's entries, in order: Your account, Workspace, People, Roles, AI and usage, Connectors. */
export const TEAM_SETTINGS = ["account", "general", "members", "roles", "usage", "connectors"] as const;

/**
 * A team's short list: its entries, and Devices where the workspace's computers are the product's (Cloud). Where
 * people bring their own machines (self-host) Devices stays under Advanced.
 */
export const teamSettings = (cloud: boolean): readonly string[] =>
  cloud ? [...TEAM_SETTINGS, "devices"] : TEAM_SETTINGS;

/**
 * The entry whose page shows `id`: the section that holds it, when the person may open that one (`open`) and `id` has
 * no line of its own in the short list; else `id` itself.
 */
export function settingsEntry(id: string, open: ReadonlySet<string>, short: readonly string[]): string {
  const host = SETTINGS_PARTS[id];
  return host && open.has(host) && !short.includes(id) ? host : id;
}

/**
 * The list from the sections the person may open (`open`, in their usual order): the short list, then Advanced with
 * every other one that no entry holds.
 */
export function settingsNav<T extends { id: string }>(
  open: readonly T[],
  short: readonly string[],
): { main: T[]; advanced: T[] } {
  const ids = new Set(open.map((s) => s.id));
  return {
    main: short.flatMap((id) => open.filter((s) => s.id === id)),
    advanced: open.filter((s) => !short.includes(s.id) && settingsEntry(s.id, ids, short) === s.id),
  };
}

/**
 * The tabs of `entry`'s page: itself first, then the sections it holds that the person may open. Billing is no tab:
 * it stands under AI and usage's own. One tab alone is no tab strip (an empty list).
 */
export function settingsTabs(entry: string, open: readonly string[], short: readonly string[]): string[] {
  const ids = new Set(open);
  const parts = open.filter((id) => id !== entry && id !== "billing" && settingsEntry(id, ids, short) === entry);
  return parts.length > 0 ? [entry, ...parts] : [];
}
