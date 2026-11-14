import { describe, expect, test } from "bun:test";
import type { Agent } from "../src/api/types";
import {
  invitableChannels,
  inviteAgentCase,
  invitePickable,
  inviteReach,
  inviteStart,
  linkFull,
  plainLink,
  sameChoices,
} from "../src/lib/invite-start";

const none = { channelIds: [], agentIds: [] };
const roles = [
  { id: "suporte", channelIds: ["c-suporte", "c-chamados"], agentIds: ["a-max"] },
  { id: "financeiro", channelIds: ["c-contas"], agentIds: ["a-fin", "a-max"] },
  { id: "vazio" },
];

describe("what an invitation starts someone with (ADR 0184)", () => {
  test("the picked cargos bring their channels and agents, then the ones added, less the ones taken out", () => {
    expect(inviteStart(roles, [], none, none)).toEqual(none);
    expect(inviteStart(roles, ["suporte"], none, none)).toEqual({
      channelIds: ["c-suporte", "c-chamados"],
      agentIds: ["a-max"],
    });
    // Two cargos: each once, in the cargos' order; one with no reach read adds nothing.
    expect(inviteStart(roles, ["suporte", "financeiro", "vazio"], none, none)).toEqual({
      channelIds: ["c-suporte", "c-chamados", "c-contas"],
      agentIds: ["a-max", "a-fin"],
    });
    // Taken out stays out, even when another cargo brings it again; added by hand comes after.
    const removed = { channelIds: ["c-chamados"], agentIds: ["a-max"] };
    const added = { channelIds: ["c-geral-2"], agentIds: ["a-ada"] };
    expect(inviteStart(roles, ["suporte", "financeiro"], added, removed)).toEqual({
      channelIds: ["c-suporte", "c-contas", "c-geral-2"],
      agentIds: ["a-fin", "a-ada"],
    });
  });

  test("each agent's case, as the server decides it", () => {
    const agent = (extra: Partial<Agent>) => ({ id: "a-fin", ownerUserId: "u-bruno", ...extra }) as Agent;
    const people = (extra: Partial<Agent> = {}) =>
      agent({ audienceMode: "people", audience: { mode: "people", userIds: [], roleIds: [] }, ...extra });
    const lia = { userId: "u-lia", managesAgents: false };
    const admin = { userId: "u-ana", managesAgents: true };
    expect(inviteAgentCase(agent({ audienceMode: "everyone" }), lia, [])).toBe("everyone");
    expect(inviteAgentCase(people(), lia, ["a-fin"])).toBe("cargo");
    expect(inviteAgentCase(people(), lia, [])).toBe("locked");
    expect(inviteAgentCase(people({ ownerUserId: "u-lia" }), lia, [])).toBe("opens");
    expect(inviteAgentCase(people(), admin, [])).toBe("opens");
    expect(inviteAgentCase(people(), admin, [], ["Bruno"])).toBe("mailbox");
    // On its owner's plan, answering nobody else: only its owner's own switch lets anyone in.
    const plan = { kind: "claude_code", account: "Claude Max" } as Agent["brain"];
    const kept = agent({ audienceMode: "owner", audience: { mode: "owner", userIds: [], roleIds: [] }, brain: plan });
    expect(inviteAgentCase(kept, { userId: "u-bruno", managesAgents: false }, [])).toBe("plan");
    // On a plan that already answers some people, it opens like any other.
    expect(
      inviteAgentCase(
        people({ brain: plan, audience: { mode: "people", userIds: ["u-rui"], roleIds: [] } }),
        admin,
        [],
      ),
    ).toBe("opens");
    expect(
      ["everyone", "cargo", "opens", "locked", "plan", "mailbox"].filter((c) => invitePickable(c as never)),
    ).toEqual(["everyone", "cargo", "opens"]);
  });
});

describe("what the dialog offers and sends (ADR 0184)", () => {
  const roles = [
    { id: "everyone", kind: "everyone" as const, permissions: ["post"] },
    { id: "suporte", kind: "custom" as const, permissions: ["approve_actions"] },
    { id: "falantes", kind: "custom" as const, permissions: ["talk_to_agents"] },
    { id: "admin", kind: "custom" as const, permissions: ["administrator"] },
  ];

  test("talking to agents comes from Todos or a picked cargo, Administrador included", () => {
    expect(inviteReach(roles, [])).toEqual({ talks: false, admin: false });
    expect(inviteReach(roles, ["suporte"])).toEqual({ talks: false, admin: false });
    expect(inviteReach(roles, ["suporte", "falantes"])).toEqual({ talks: true, admin: false });
    expect(inviteReach(roles, ["admin"])).toEqual({ talks: true, admin: true });
    const open = roles.map((r) => (r.id === "everyone" ? { ...r, permissions: ["talk_to_agents"] } : r));
    expect(inviteReach(open, []).talks).toBe(true);
  });

  test("channels: public ones, ones the viewer is in, private ones limited to a picked cargo; never #general", () => {
    const channels = [
      { id: "g", name: "general", visibility: "public" as const, isMember: true },
      { id: "pub", name: "clientes", visibility: "public" as const, isMember: false },
      { id: "in", name: "diretoria", visibility: "private" as const, isMember: true },
      { id: "sup", name: "suporte", visibility: "private" as const, isMember: false, audienceRoleIds: ["suporte"] },
      { id: "out", name: "financeiro", visibility: "private" as const, isMember: false, audienceRoleIds: ["fin"] },
    ];
    expect(invitableChannels(channels, []).map((c) => c.id)).toEqual(["pub", "in"]);
    expect(invitableChannels(channels, ["suporte"]).map((c) => c.id)).toEqual(["pub", "in", "sup"]);
  });

  test("a link at the defaults is the workspace's own; any choice, a link of its own; two links' choices compare as sets", () => {
    const plain = { roleIds: [], channelIds: [], agentIds: [], expiresIn: "30d" as const, maxUses: null };
    expect(plainLink(plain)).toBe(true);
    expect(plainLink({ ...plain, roleIds: ["suporte"] })).toBe(false);
    expect(plainLink({ ...plain, expiresIn: "7d" })).toBe(false);
    expect(plainLink({ ...plain, maxUses: 1 })).toBe(false);
    expect(sameChoices({ ...plain, channelIds: ["a", "b"] }, { ...plain, channelIds: ["b", "a"] })).toBe(true);
    expect(sameChoices({ ...plain, channelIds: ["a"] }, { ...plain, channelIds: ["a", "b"] })).toBe(false);
    expect(sameChoices(plain, { ...plain, expiresIn: "never" })).toBe(false);
    expect(linkFull({ maxUses: 1, uses: 1 })).toBe(true);
    expect(linkFull({ maxUses: 5, uses: 1 })).toBe(false);
    expect(linkFull({ maxUses: null, uses: 40 })).toBe(false);
  });
});
