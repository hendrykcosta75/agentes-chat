import { afterEach, describe, expect, test } from "bun:test";
import { createFakeGifs } from "@agenteschat/adapters";
import { eq, schema } from "@agenteschat/db";
import { type Browser, browser, createTestServer, joinByInvitation, seedOrg, signUp, type TestServer } from "./harness";

/**
 * GIFs and stickers in chat (ADR 0091): search and files through the server, posting them, the workspace's switches
 * and the agent's own.
 */

let t: TestServer;
afterEach(async () => {
  const current = t;
  t = undefined as unknown as TestServer;
  await current?.close();
});

type Page = { gifs: { id: string; title: string; width: number; height: number }[]; next: number | null };
type Posted = { id: string; body: string; meta: Record<string, unknown> };

/** An owner with Acme, its #general and the agent @dev; `api` calls the workspace's routes as the owner. */
async function start(options: Parameters<typeof createTestServer>[0] = {}) {
  t = await createTestServer(options);
  const owner = browser(t);
  await signUp(owner, "owner@example.com");
  const seeded = await seedOrg(owner);
  const api = (path: string, init?: Parameters<Browser>[1]) =>
    owner(`/api/app/organizations/${seeded.orgId}${path}`, init);
  const post = (json: Record<string, unknown>) => api(`/channels/${seeded.channelId}/messages`, { json });
  return { owner, api, post, ...seeded };
}

const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("GIF search", () => {
  test("trending, free text and a category, at the workspace's rating, page by page", async () => {
    const gifs = createFakeGifs();
    const { api } = await start({ gifs });
    const first = await api("/gifs?limit=5");
    expect(first.status).toBe(200);
    const trending = (await first.json()) as Page;
    expect(trending.gifs).toHaveLength(5);
    expect(trending.next).toBe(5);
    expect(trending.gifs[0]).toEqual({ id: "fakeCelebration1", title: "Celebration dance", width: 480, height: 270 });
    const last = (await (await api("/gifs?limit=5&offset=10")).json()) as Page;
    expect(last).toMatchObject({ next: null });
    expect(last.gifs.map((g) => g.id)).toEqual(["fakeOops1", "fakeThinking1"]);
    expect(gifs.calls.trending.at(-1)).toEqual({ rating: "g", limit: 5, offset: 10 });

    const dance = (await (await api("/gifs?q=dance&lang=pt-BR")).json()) as Page;
    expect(dance.gifs.map((g) => g.id)).toEqual(["fakeCelebration1", "fakeFriday1"]);
    expect(gifs.calls.search.at(-1)).toEqual({ query: "dance", rating: "g", lang: "pt", limit: 24, offset: 0 });

    // A category searches its own English query; a GIF rated above the workspace's rating never comes.
    const party = (await (await api("/gifs?category=celebrate")).json()) as Page;
    expect(party.gifs.map((g) => g.id)).toEqual(["fakeCelebration1", "fakeCelebration2"]);
    expect(gifs.calls.search.at(-1)).toMatchObject({ query: "celebration", lang: "en" });
    expect((await api("/settings", { method: "PATCH", json: { gifRating: "pg" } })).status).toBe(200);
    const pg = (await (await api("/gifs?category=celebrate")).json()) as Page;
    expect(pg.gifs.map((g) => g.id)).toEqual(["fakeCelebration1", "fakeCelebration2", "fakeParty1"]);

    expect((await api("/gifs?category=fireworks")).status).toBe(400);
    expect((await api("/gifs?limit=500")).status).toBe(400);
  });

  test("off without a provider or with the workspace's switch; members only; limited per person", async () => {
    const { owner, api, orgId } = await start({ env: { ALLOW_SIGNUP: "true" } });
    const stranger = browser(t);
    await signUp(stranger, "stranger@example.com");
    expect((await stranger(`/api/app/organizations/${orgId}/gifs`)).status).toBe(403);
    expect((await browser(t)(`/api/app/organizations/${orgId}/gifs`)).status).toBe(401);
    expect((await stranger(`/api/app/organizations/${orgId}/gifs/fakeThanks1/media`)).status).toBe(403);
    // A member searches too.
    const member = await joinByInvitation(t, owner, orgId, "member@example.com");
    expect((await member(`/api/app/organizations/${orgId}/gifs?q=coffee`)).status).toBe(200);

    expect((await api("/settings", { method: "PATCH", json: { gifs: false } })).status).toBe(200);
    const off = await api("/gifs");
    expect(off.status).toBe(404);
    expect(await errorCode(off)).toBe("gifs.off");
    expect((await api("/gifs/fakeThanks1/media")).status).toBe(404);
    expect((await api("/settings", { method: "PATCH", json: { gifs: true } })).status).toBe(200);

    let status = 0;
    for (let i = 0; i < 61 && status !== 429; i++) status = (await api(`/gifs?q=wow${i}`)).status;
    expect(status).toBe(429);
  });

  test("without a GIF provider (no GIPHY_API_KEY) there are no GIFs at all, and the settings say so", async () => {
    const { api, post } = await start({ gifs: null });
    const res = await api("/gifs");
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("gifs.off");
    expect((await api("/gifs/fakeThanks1/media?size=preview")).status).toBe(404);
    expect(await (await api("/settings")).json()).toMatchObject({ gifs: true, gifsAvailable: false });
    const refused = await post({ body: "", media: { kind: "gif", id: "fakeThanks1" } });
    expect(refused.status).toBe(422);
    expect(await errorCode(refused)).toBe("message.media_off");
  });

  test("a GIF's file comes through the server: its bytes and type, cached for good, never run as a page", async () => {
    const gifs = createFakeGifs();
    const { api } = await start({ gifs });
    const res = await api("/gifs/fakeThanks1/media?size=preview");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 6))).toBe("GIF89a");
    // `full` unless the app says otherwise.
    expect((await api("/gifs/fakeThanks1/media")).status).toBe(200);
    expect(gifs.calls.media).toEqual([
      { id: "fakeThanks1", size: "preview", rating: "g" },
      { id: "fakeThanks1", size: "full", rating: "g" },
    ]);
    expect((await api("/gifs/nothing1/media")).status).toBe(404);
    expect((await api("/gifs/fakeThanks1/media?size=huge")).status).toBe(400);
    expect((await api(`/gifs/${encodeURIComponent("not a gif")}/media`)).status).toBe(400);
    expect(gifs.calls.media).toHaveLength(3);
  });

  test("a GIF's file only at the workspace's rating: one rated above it isn't there", async () => {
    const gifs = createFakeGifs();
    const { api } = await start({ gifs });
    // `r` at the default `g`, and `pg` too.
    expect((await api("/gifs/fakeWild1/media")).status).toBe(404);
    expect((await api("/gifs/fakeParty1/media")).status).toBe(404);
    expect((await api("/settings", { method: "PATCH", json: { gifRating: "pg" } })).status).toBe(200);
    expect((await api("/gifs/fakeParty1/media")).status).toBe(200);
    expect((await api("/gifs/fakeWild1/media")).status).toBe(404);
    expect(gifs.calls.media.map((c) => c.rating)).toEqual(["g", "g", "pg", "pg"]);
  });
});

describe("posting a GIF or a sticker", () => {
  test("a GIF is looked up on the server: the provider's title and size stored, whatever the app sent", async () => {
    const { post, api, channelId } = await start();
    const res = await post({
      body: "",
      media: { kind: "gif", id: "fakeCelebration1", title: "Not this", width: 9999, height: 1 },
    });
    expect(res.status).toBe(201);
    const gif = (await res.json()) as Posted;
    expect(gif.body).toBe("");
    expect(gif.meta.media).toEqual({
      kind: "gif",
      provider: "giphy",
      id: "fakeCelebration1",
      title: "Celebration dance",
      width: 480,
      height: 270,
    });
    const listed = (await (await api(`/channels/${channelId}/messages`)).json()) as { messages: Posted[] };
    expect(listed.messages.find((m) => m.id === gif.id)?.meta.media).toEqual(gif.meta.media);
    // The channel list says what it was where its text would be.
    const channels = (await (await api("/channels")).json()) as {
      channels: { id: string; lastMessage: { id: string; preview: string; mediaKind: string | null } | null }[];
    };
    expect(channels.channels.find((c) => c.id === channelId)?.lastMessage).toMatchObject({
      id: gif.id,
      preview: "",
      mediaKind: "gif",
    });
    // Nothing to search in it.
    const indexed = (await t.db.select().from(schema.outbox).where(eq(schema.outbox.kind, "search.index"))).map(
      (j) => (j.payload as { sourceId?: string }).sourceId,
    );
    expect(indexed).not.toContain(gif.id);

    // A quote of it says it was a GIF.
    const reply = (await (await post({ body: "haha", replyTo: gif.id })).json()) as Posted;
    expect(reply.meta.replyTo).toMatchObject({ messageId: gif.id, excerpt: "", mediaKind: "gif" });
    // No words and no media is no message.
    expect((await post({ body: "" })).status).toBe(400);
  });

  test("refused with 422: an unknown GIF, one above the rating, GIFs or stickers off", async () => {
    const { post, api, agentId } = await start();
    const send = async (media: Record<string, unknown>) => {
      const res = await post({ body: "", media });
      return res.status === 201 ? 201 : `${res.status} ${await errorCode(res)}`;
    };
    expect(await send({ kind: "gif", id: "nothing1" })).toBe("422 message.media_not_found");
    expect(await send({ kind: "gif", id: "fakeParty1" })).toBe("422 message.media_not_found");
    expect((await api("/settings", { method: "PATCH", json: { gifRating: "pg" } })).status).toBe(200);
    expect(await send({ kind: "gif", id: "fakeParty1" })).toBe(201);
    expect((await api("/settings", { method: "PATCH", json: { gifs: false } })).status).toBe(200);
    expect(await send({ kind: "gif", id: "fakeThanks1" })).toBe("422 message.media_off");

    expect(await send({ kind: "sticker", agentId, mood: "celebrate" })).toBe(201);
    expect(await send({ kind: "sticker", agentId, mood: "angry" })).toBe("400 invalid_request");
    expect((await api("/settings", { method: "PATCH", json: { agentStickers: false } })).status).toBe(200);
    expect(await send({ kind: "sticker", agentId, mood: "celebrate" })).toBe("422 message.media_off");
  });

  test("a sticker is one of this workspace's agents: another workspace's agent is refused", async () => {
    const { post, agentId } = await start({ env: { ALLOW_SIGNUP: "true" } });
    const ok = await post({ body: "", media: { kind: "sticker", agentId, mood: "deal" } });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as Posted).meta.media).toEqual({ kind: "sticker", agentId, mood: "deal" });

    const stranger = browser(t);
    await signUp(stranger, "stranger@example.com");
    const theirs = await seedOrg(stranger);
    const refused = await post({ body: "", media: { kind: "sticker", agentId: theirs.agentId, mood: "deal" } });
    expect(refused.status).toBe(422);
    expect(await errorCode(refused)).toBe("message.media_not_found");
  });

  test("a DM of only a GIF pushes what it was, in the phone's language", async () => {
    const { owner, orgId } = await start({ env: { ALLOW_SIGNUP: "true" } });
    const bia = await joinByInvitation(t, owner, orgId, "bia@example.com");
    // The right hand greets who joins: that push is not this one, so it goes out before their device is known.
    await t.drain();
    const token = "b1a0c0de".repeat(8);
    const registered = await bia("/api/app/push/devices", {
      json: { token, platform: "ios", locale: "pt-BR" },
      origin: null,
      headers: { "x-agentes-client": "mobile" },
    });
    expect(registered.status).toBe(204);
    const [biaUser] = await t.db.select().from(schema.users).where(eq(schema.users.email, "bia@example.com"));
    const dm = (await (
      await owner(`/api/app/organizations/${orgId}/dms`, { json: { userId: biaUser?.id } })
    ).json()) as { channelId: string };
    const sent = await owner(`/api/app/organizations/${orgId}/channels/${dm.channelId}/messages`, {
      json: { body: "", media: { kind: "gif", id: "fakeThanks1" } },
    });
    expect(sent.status).toBe(201);
    await t.drain();
    expect(t.push.sent).toHaveLength(1);
    expect(t.push.sent[0]).toMatchObject({ to: token, title: "owner", body: "Mandou um GIF" });
  });
});

describe("settings", () => {
  test("admins switch GIFs, their rating, the agents' stickers and how often agents send, and read what the server can do", async () => {
    const { owner, api, orgId } = await start({ env: { ALLOW_SIGNUP: "true" } });
    expect(await (await api("/settings")).json()).toMatchObject({
      gifs: true,
      gifRating: "g",
      agentStickers: true,
      agentMedia: "sometimes",
      gifsAvailable: true,
      agentMediaAvailable: false,
    });
    const changed = { gifs: false, gifRating: "pg", agentStickers: false, agentMedia: "often" };
    const patched = await api("/settings", { method: "PATCH", json: changed });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject(changed);
    expect(await (await api("/settings")).json()).toMatchObject(changed);
    expect((await api("/settings", { method: "PATCH", json: { gifRating: "r" } })).status).toBe(400);
    expect((await api("/settings", { method: "PATCH", json: { agentMedia: "always" } })).status).toBe(400);
    // Read only: sent back, nothing changes.
    await api("/settings", { method: "PATCH", json: { gifsAvailable: false, agentMediaAvailable: true } });
    expect(await (await api("/settings")).json()).toMatchObject({ gifsAvailable: true, agentMediaAvailable: false });

    const member = await joinByInvitation(t, owner, orgId, "member@example.com");
    const asMember = await member(`/api/app/organizations/${orgId}/settings`, {
      method: "PATCH",
      json: { gifs: true },
    });
    expect(asMember.status).toBe(403);
    // Members read them: the composer shows what the workspace allows.
    expect(await (await member(`/api/app/organizations/${orgId}/settings`)).json()).toMatchObject({ gifs: false });
  });

  test("with a Jev key the agents may send theirs: agentMediaAvailable", async () => {
    const { api } = await start({ env: { TYPESAFE_API_KEY: "ts_env_key_abcd" } });
    expect(await (await api("/settings")).json()).toMatchObject({ agentMediaAvailable: true });
  });

  test("mediaReplies: on for every agent, admins turn it off for one", async () => {
    const { owner, api, orgId, agentId } = await start({ env: { ALLOW_SIGNUP: "true" } });
    const listed = (await (await api("/agents")).json()) as { agents: { id: string; mediaReplies: boolean }[] };
    expect(listed.agents.find((a) => a.id === agentId)?.mediaReplies).toBe(true);
    const off = await api(`/agents/${agentId}`, { method: "PATCH", json: { mediaReplies: false } });
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ id: agentId, mediaReplies: false });
    expect(await (await api(`/agents/${agentId}`)).json()).toMatchObject({ mediaReplies: false });
    const [row] = await t.db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
    expect(row?.mediaReplies).toBe(false);

    const member = await joinByInvitation(t, owner, orgId, "member@example.com");
    const asMember = await member(`/api/app/organizations/${orgId}/agents/${agentId}`, {
      method: "PATCH",
      json: { mediaReplies: true },
    });
    expect(asMember.status).toBe(403);
  });

  test("the search is in the API's document", async () => {
    await start();
    const doc = (await (await t.app.request("/api/openapi.json")).json()) as { paths: Record<string, unknown> };
    expect(doc.paths["/app/organizations/{orgId}/gifs"]).toBeDefined();
  });
});
