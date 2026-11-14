import { describe, expect, test } from "bun:test";
import { personalSettingsShort } from "../src/lib/personal-view";
import { settingsEntry, settingsNav, settingsTabs, teamSettings } from "../src/lib/settings-nav";

/* The settings list: a few entries, each holding sections as tabs, the rest under Advanced. */

const ALL = [
  "account",
  "notifications",
  "approvals",
  "apps",
  "general",
  "media",
  "voice",
  "members",
  "invites",
  "roles",
  "usage",
  "billing",
  "connectors",
  "skills",
  "vault",
  "access",
  "devices",
  "storage",
  "import",
  "audit",
  "about",
];
const sections = (ids: string[]) => ids.map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("a team's list", () => {
  test("self-hosted: six entries, Cargos its own, Devices first under Advanced with what no entry holds", () => {
    const { main, advanced } = settingsNav(sections(ALL), teamSettings(false));
    expect(ids(main)).toEqual(["account", "general", "members", "roles", "usage", "connectors"]);
    expect(ids(advanced)).toEqual(["devices", "storage", "import", "audit", "about"]);
  });

  test("on the Cloud Devices is the seventh entry", () => {
    const { main, advanced } = settingsNav(sections(ALL), teamSettings(true));
    expect(ids(main).at(-1)).toBe("devices");
    expect(ids(advanced)).toEqual(["storage", "import", "audit", "about"]);
  });

  test("each entry's tabs are the sections it holds, itself first; billing is a part, never a tab", () => {
    const short = teamSettings(true);
    expect(settingsTabs("account", ALL, short)).toEqual(["account", "notifications", "approvals", "apps"]);
    expect(settingsTabs("general", ALL, short)).toEqual(["general", "media", "voice"]);
    // Cargos is an entry of its own (ADR 0085 addendum of 2026-11-13); People holds Membros and Convites (ADR 0184).
    expect(settingsTabs("members", ALL, short)).toEqual(["members", "invites"]);
    expect(settingsTabs("roles", ALL, short)).toEqual([]);
    expect(settingsTabs("connectors", ALL, short)).toEqual(["connectors", "skills", "vault", "access"]);
    expect(settingsTabs("usage", ALL, short)).toEqual([]);
    expect(settingsTabs("devices", ALL, short)).toEqual([]);
    expect(settingsEntry("billing", new Set(ALL), short)).toBe("usage");
  });

  test("a section whose entry the person can't open keeps a line of its own, under Advanced", () => {
    const open = ["account", "members", "media", "usage", "connectors", "vault"];
    const short = teamSettings(true);
    expect(settingsEntry("media", new Set(open), short)).toBe("media");
    expect(ids(settingsNav(sections(open), short).advanced)).toEqual(["media"]);
    expect(settingsTabs("connectors", open, short)).toEqual(["connectors", "vault"]);
    // One section alone has no tab strip.
    expect(settingsTabs("members", open, short)).toEqual([]);
  });
});

describe("a personal workspace's list", () => {
  test("keeps its own short list: the Vault is a line there, so it is no tab of Connectors", () => {
    const short = personalSettingsShort(0);
    const { main, advanced } = settingsNav(sections(ALL), short);
    expect(ids(main)).toEqual(["account", "general", "usage", "connectors", "vault", "devices"]);
    expect(ids(advanced)).toEqual(["members", "roles", "storage", "import", "audit", "about"]);
    expect(settingsTabs("connectors", ALL, short)).toEqual(["connectors", "skills", "access"]);
    // Inviting someone in works the same: People's Convites tab.
    expect(settingsTabs("members", ALL, short)).toEqual(["members", "invites"]);
  });

  test("with other people here People is on the list", () => {
    expect(ids(settingsNav(sections(ALL), personalSettingsShort(2)).main)).toContain("members");
  });
});
